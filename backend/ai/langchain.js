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

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,
  maxTokens: 4096
});

function buildSegmentTranscript(transcriptSegments, maxChars = 40000) {
  if (!transcriptSegments || transcriptSegments.length === 0) return '';
  return transcriptSegments
    .map(seg => `${seg.speaker}: ${seg.text}`)
    .join('\n')
    .substring(0, maxChars);
}

const meetingAnalysisChain = async (transcript, domain, attendees, promptTemplate, transcriptSegments = null) => {
  try {
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

const createRAGChain = async () => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', `You are a professional meeting analyst assistant. Answer questions about the meeting in a natural, conversational and presentable way.

Rules:
1. Synthesize information — do NOT just list raw transcript lines
2. Write in complete, natural sentences as if you attended the meeting
3. Summarize what was said in your own words, do not quote verbatim unless the exact wording is critical
4. Keep answers concise — 2-5 sentences for simple questions, short paragraphs for complex ones
5. If multiple people spoke on a topic, summarize each person's perspective naturally
6. If the answer is not in the context, say "This was not discussed in the meeting"
7. Never use bullet points unless listing 3+ distinct items
8. Do not start with "According to the transcript" — just answer directly
9. Use past tense — the meeting already happened
10. Format: plain readable text, bold only for names when introducing them`],
    ['human', `Meeting transcript context:
{context}

Question: {question}`]
  ]);

  return prompt.pipe(llm).pipe(new StringOutputParser());
};

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

    // ✅ FIX: Removed .replace(/\{/g, '{{').replace(/\}/g, '}}') from transcript content.
    // Those replacements corrupted any JSON objects, code snippets, or curly-brace text
    // in transcripts (e.g. "{action: deploy}" became "{{action: deploy}}").
    // LangChain handles variable substitution safely via invoke() — the transcript value
    // is passed as a named variable, NOT interpolated into a template string, so no
    // escaping of braces is needed or wanted.
    return await chain.invoke({
      transcript: transcript.substring(0, 10000)
    });
  } catch (error) {
    logger.error(`Error in transcript summarization: ${error.message}`);
    return 'Unable to generate summary.';
  }
};

const scoreAttendeeChain = async (attendeeName, transcript, domain, transcriptSegments = null) => {
  try {
    let formattedTranscript;

    if (transcriptSegments && transcriptSegments.length > 0) {
      const fullTranscript = buildSegmentTranscript(transcriptSegments, 40000);

      const attendeeSegments = transcriptSegments.filter(
        seg => seg.speaker && seg.speaker.toLowerCase() === attendeeName.toLowerCase()
      );

      const attendeeLines = attendeeSegments.map(seg => seg.text).join(' ');
      const attendeeSpeakingTime = attendeeSegments.length;
      const totalSegments = transcriptSegments.length;
      const speakingPercentage = totalSegments > 0
        ? ((attendeeSpeakingTime / totalSegments) * 100).toFixed(1)
        : '0';

      const substantiveSegments = attendeeSegments.filter(seg => {
        const text = seg.text.trim().toLowerCase();
        const fillerWords = ['okay', 'ok', 'yes', 'yeah', 'sure', 'hmm', 'start', 'hi', 'hello', 'bye', 'thanks', 'thank you', 'alright', 'right', 'good', 'great'];
        return text.split(' ').length > 3 && !fillerWords.includes(text.replace(/[^a-z]/g, ''));
      });

      formattedTranscript = `FULL MEETING TRANSCRIPT:
${fullTranscript}

---
ANALYSIS FOR ${attendeeName.toUpperCase()}:
- Total segments spoken: ${attendeeSpeakingTime} out of ${totalSegments} (${speakingPercentage}% speaking time)
- Substantive segments (excluding filler): ${substantiveSegments.length}
- Their exact words: "${attendeeLines.substring(0, 3000)}"
- Note: If speaking time is 0% or words are only filler, score must be 0-2`;
    } else {
      formattedTranscript = transcript.substring(0, 12000);
    }

    const userMessage = `Meeting Domain: ${domain}

Attendee to score: ${attendeeName}

${formattedTranscript}`;

    const response = await llm.invoke([
      ['system', `You are a senior corporate performance analyst evaluating meeting participation.

Score the named attendee on a scale of 0-10:

SCORE 0:
- Did not attend or zero segments in transcript
- No words spoken whatsoever

SCORE 1-2 (Passive/No Value):
- Present but said nothing meaningful
- Only filler words: "okay", "yes", "sure", "start", "hmm", "hi", "bye"
- Single word or very short meaningless responses
- Their absence would not have changed anything

SCORE 3-4 (Reactive):
- Only spoke when directly addressed
- Short responses without elaboration or new ideas
- Did not raise any topic proactively
- Agreed with others without adding perspective

SCORE 5-6 (Moderate):
- Participated but did not drive discussion
- Raised 1-2 relevant points
- Provided some useful information
- Responded meaningfully to others

SCORE 7-8 (Active/Good):
- Proactively raised important topics or concerns
- Provided data, analysis or insights
- Influenced at least 1 decision
- Asked clarifying questions that helped
- Constructively pushed back when needed

SCORE 9-10 (Outstanding):
- Led or drove the meeting
- Made multiple key decisions
- Synthesized different views
- Took on action items voluntarily
- Central to the outcome

STRICT RULES:
1. If attendee has 0 segments or only said filler words → score MUST be 0-2, never 5
2. Speaking a lot without substance scores LOWER than speaking little with high impact
3. The fallback score of 5 is FORBIDDEN when the person has no substantive lines
4. A no-show gets 0, a silent attendee gets 1, a filler-only attendee gets 2
5. Always reference specific things the person actually said in your reasoning
6. Never give 5 as a default — every score must be justified by transcript evidence

Return ONLY valid JSON, no markdown, no explanation outside JSON:
{"score": <number 0-10>, "keyPoints": ["<specific quote or action>", ...], "reasoning": "<2-3 sentences with transcript evidence>"}`],
      ['human', userMessage]
    ]);

    const content = response.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (transcriptSegments) {
        const mySegments = transcriptSegments.filter(
          seg => seg.speaker && seg.speaker.toLowerCase() === attendeeName.toLowerCase()
        );
        if (mySegments.length === 0 && parsed.score > 2) {
          parsed.score = 1;
          parsed.reasoning = `${attendeeName} attended the meeting but did not speak. Score capped at 1.`;
        }
      }
      return parsed;
    }

    return { score: 3, keyPoints: [], reasoning: 'Unable to analyze contribution.' };
  } catch (error) {
    logger.error(`Error in attendee scoring: ${error.message}`);
    return { score: 3, keyPoints: [], reasoning: 'Unable to analyze contribution.' };
  }
};

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