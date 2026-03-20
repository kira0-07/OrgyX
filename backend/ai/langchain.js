const { ChatGroq } = require('@langchain/groq');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser, JsonOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Initialize Groq LLM
const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,
  maxTokens: 4096
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a clean, speaker-labeled transcript string from transcriptSegments.
// This is what we pass to ALL LLM calls instead of the raw whisper text.
//
// Raw transcript looks like:  "so i was thinking we should..."  (no names)
// Segment transcript looks like:
//   "Nancy: so I was thinking we should...\nBob: yeah I agree..."
//
// The segment transcript lets the LLM correctly attribute speech to real people.
// maxChars prevents context window overflow — default 40000 chars (~10k tokens),
// enough for a 60-minute meeting without truncation issues.
// ─────────────────────────────────────────────────────────────────────────────
function buildSegmentTranscript(transcriptSegments, maxChars = 40000) {
  if (!transcriptSegments || transcriptSegments.length === 0) return '';
  return transcriptSegments
    .map(seg => `${seg.speaker}: ${seg.text}`)
    .join('\n')
    .substring(0, maxChars);
}

// Meeting Analysis Chain
// Now accepts transcriptSegments as an optional 5th argument.
// If provided, uses speaker-labeled text. Falls back to raw transcript if not.
const meetingAnalysisChain = async (transcript, domain, attendees, promptTemplate, transcriptSegments = null) => {
  try {
    // Prefer speaker-labeled segments — LLM gets real names, not Speaker_1/Speaker_2
    const effectiveTranscript = transcriptSegments && transcriptSegments.length > 0
      ? buildSegmentTranscript(transcriptSegments, 40000)
      : transcript.substring(0, 15000);

    const attendeeNames = attendees
      .map(a => typeof a === 'string' ? a : `${a.firstName || ''} ${a.lastName || ''}`.trim())
      .join(', ');

    const userMessage = promptTemplate.userPromptTemplate
      .replace('{transcript}', effectiveTranscript)
      .replace('{attendees}', attendeeNames)
      .replace('{domain}', domain)
      .replace('{date}', new Date().toISOString());

    const response = await llm.invoke([
      ['system', promptTemplate.systemPrompt],
      ['human', userMessage]
    ]);

    const content = response.content;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      summary: content.substring(0, 500),
      conclusions: [],
      decisions: [],
      actionItems: [],
      followUpTopics: [],
      attendeeContributions: []
    };
  } catch (error) {
    logger.error(`Error in meeting analysis chain: ${error.message}`);
    return {
      summary: 'Meeting analysis could not be completed automatically.',
      conclusions: [],
      decisions: [],
      actionItems: [],
      followUpTopics: [],
      attendeeContributions: []
    };
  }
};

// RAG Chain for meeting Q&A
const createRAGChain = async () => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', `You are a meeting assistant. Answer questions about the meeting using only the context provided.

Rules:
1. Always cite specific parts of the transcript that support your answer
2. If the answer is not in the context, say "I cannot find this information in the meeting transcript"
3. Be concise and direct
4. Use bullet points for multiple items
5. Format speaker names as bold`],
    ['human', `Context from meeting transcript:
{context}

Question: {question}`]
  ]);

  return prompt.pipe(llm).pipe(new StringOutputParser());
};

// Recommendation Reasoning Chain
const recommendationReasoningChain = async (performanceData, category, riskScore) => {
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `You are an HR analytics AI. Write a clear, professional explanation for why an employee has been categorized as "${category}".

Guidelines:
- Be objective and data-driven
- Mention specific metrics (score, trend, risk factors)
- If at-risk, explain what factors contributed to the risk assessment
- If promote-worthy, highlight their achievements and trajectory
- Keep it to 2-3 sentences
- Use professional but accessible language`],
      ['human', `Employee Data:
- Current Performance Score: ${performanceData.currentScore}/100
- Performance Trend: ${performanceData.trend}
- Resignation Risk Score: ${riskScore !== null ? (riskScore * 100).toFixed(1) + '%' : 'N/A'}
- Task Completion Rate: ${(performanceData.taskStats?.completionRate || 0) * 100}%
- Consecutive Declining/Neutral Days: ${performanceData.consecutiveNeutralOrDecliningDays || 0}
- Meeting Contribution Average: ${(performanceData.meetingStats?.avgContributionScore || 0).toFixed(1)}/10
- Attendance Rate: ${(performanceData.attendanceStats?.attendanceRate || 0) * 100}%

Please write the reasoning for this categorization.`]
    ]);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    return await chain.invoke({});
  } catch (error) {
    logger.error(`Error in recommendation reasoning chain: ${error.message}`);
    return `Employee has been categorized as "${category}" based on performance metrics and trend analysis.`;
  }
};

// Transcript Summarization Chain
const summarizeTranscriptChain = async (transcript, maxLength = 1500) => {
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `Summarize the following meeting transcript in ${maxLength} words or less.

Include:
1. Main topics discussed
2. Key decisions made
3. Action items (who does what)
4. Any blockers or concerns raised

Be concise and professional.`],
      ['human', '{transcript}']
    ]);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    return await chain.invoke({
      transcript: transcript
        .substring(0, 10000)
        .replace(/\{/g, '{{')
        .replace(/\}/g, '}}')
    });
  } catch (error) {
    logger.error(`Error in transcript summarization: ${error.message}`);
    return 'Unable to generate summary.';
  }
};

// Attendee Contribution Scoring Chain
// FIXED: now accepts transcriptSegments so the LLM sees real speaker names.
// Previously received raw transcript with Speaker_1/Speaker_2 — Groq couldn't
// find "Nancy" anywhere and gave everyone the same middle score (~5).
// Now each call gets only the segments where the named attendee actually spoke,
// plus full context of the whole meeting so relative contribution is clear.
const scoreAttendeeChain = async (attendeeName, transcript, domain, transcriptSegments = null) => {
  try {
    let formattedTranscript;

    if (transcriptSegments && transcriptSegments.length > 0) {
      // Build full speaker-labeled transcript for context
      const fullTranscript = buildSegmentTranscript(transcriptSegments, 40000);

      // Extract only this attendee's lines so the LLM knows exactly what they said
      const attendeeLines = transcriptSegments
        .filter(seg => seg.speaker && seg.speaker.toLowerCase() === attendeeName.toLowerCase())
        .map(seg => seg.text)
        .join(' ');

      const attendeeSpeakingTime = transcriptSegments
        .filter(seg => seg.speaker && seg.speaker.toLowerCase() === attendeeName.toLowerCase())
        .length;

      const totalSegments = transcriptSegments.length;
      const speakingPercentage = totalSegments > 0
        ? ((attendeeSpeakingTime / totalSegments) * 100).toFixed(1)
        : '0';

      formattedTranscript = `FULL MEETING TRANSCRIPT (speaker-labeled):
${fullTranscript}

---
SUMMARY FOR ${attendeeName.toUpperCase()}:
- Spoke in ${attendeeSpeakingTime} of ${totalSegments} segments (${speakingPercentage}% of meeting)
- Their exact words: "${attendeeLines.substring(0, 3000)}"`;
    } else {
      // Fallback to raw transcript if no segments (should rarely happen after our fixes)
      formattedTranscript = transcript.substring(0, 12000);
    }

    const userMessage = `Meeting Domain: ${domain}

Attendee to score: ${attendeeName}

${formattedTranscript}`;

    const response = await llm.invoke([
      ['system', `Score the named attendee's participation in this meeting on a scale of 0-10 using this exact rubric:

0-2: Attendee was present but said nothing of substance. No questions, no contributions, no decisions influenced.
3-4: Minimal participation. Responded when directly addressed but did not proactively contribute.
5-6: Moderate participation. Asked relevant questions or provided input on at least 2 topics. Did not drive any decisions.
7-8: Active participation. Contributed meaningfully to 3+ topics, raised important points, influenced at least 1 decision or action item assignment.
9-10: Led the meeting or was central to its outcome. Drove decisions, synthesized others' input, assigned action items, resolved conflicts or ambiguity.

Rules:
- Weight speaking time at 30% and content quality at 70%
- Do not reward talking for the sake of talking
- Content quality is assessed by: questions asked, insights provided, decisions influenced, action items owned voluntarily, blockers identified
- Use the speaker summary provided to accurately assess this specific person
- If the attendee has 0 segments or said nothing, score them 0-2

Return ONLY a JSON object: {"score": <number 0-10>, "keyPoints": [<string>, ...], "reasoning": "<string>"}`],
      ['human', userMessage]
    ]);

    const content = response.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { score: 5, keyPoints: [], reasoning: 'Unable to analyze contribution.' };
  } catch (error) {
    logger.error(`Error in attendee scoring: ${error.message}`);
    return { score: 5, keyPoints: [], reasoning: 'Unable to analyze contribution.' };
  }
};

// Chunking function for long transcripts
function chunkTranscript(text, maxTokens = 300) {
  const maxChars = maxTokens * 4;
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        chunks.push(sentence.substring(0, maxChars));
        currentChunk = sentence.substring(maxChars);
      }
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

module.exports = {
  llm,
  meetingAnalysisChain,
  createRAGChain,
  recommendationReasoningChain,
  summarizeTranscriptChain,
  scoreAttendeeChain,
  chunkTranscript
};