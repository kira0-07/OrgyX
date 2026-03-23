const { chromaClient } = require('../config/chroma');
const { generateEmbedding } = require('./embeddings');
const { createRAGChain } = require('./langchain');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

/**
 * RAG Q&A for meeting transcripts
 * @param {string} question - User's question
 * @param {string} meetingId - Meeting ID to query within
 * @returns {Promise<string>} - Answer with citations
 */
async function ragMeetingQA(question, meetingId) {
  try {
    logger.info(`RAG query for meeting ${meetingId}: ${question}`);

    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question);

    // Query ChromaDB for relevant chunks
    const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });

    const results = await collection.query({
      queryEmbeddings: [questionEmbedding],
      nResults: 5,
      where: { meetingId }
    });

    if (!results.documents[0] || results.documents[0].length === 0) {
      return {
        answer: 'I cannot find relevant information in this meeting transcript.',
        sources: []
      };
    }

    // Build context from retrieved chunks
    const context = results.documents[0]
      .map((doc, idx) => {
        const metadata = results.metadatas[0][idx];
        const timestamp = metadata?.timestamp || 'Unknown time';
        const speaker = metadata?.speaker || 'Unknown speaker';
        return `[${timestamp}] ${speaker}: ${doc}`;
      })
      .join('\n\n');

    // Create and run RAG chain
    const chain = await createRAGChain();
    const answer = await chain.invoke({ context, question });

    // Build source citations
    const sources = results.documents[0].map((doc, idx) => ({
      text: doc,
      metadata: results.metadatas[0][idx],
      relevanceScore: results.distances ? 1 - results.distances[0][idx] : 0.5
    }));

    return {
      answer,
      sources
    };
  } catch (error) {
    logger.error(`Error in RAG meeting QA: ${error.message}`);
    return {
      answer: 'Sorry, I encountered an error while processing your question.',
      sources: [],
      error: error.message
    };
  }
}

/**
 * Find similar meetings based on transcript content
 * @param {string} meetingId - Meeting ID to find similar meetings for
 * @param {number} limit - Number of similar meetings to return
 * @returns {Promise<Array>} - Array of similar meetings
 */
async function findSimilarMeetings(meetingId, limit = 3) {
  try {
    logger.info(`Finding similar meetings to ${meetingId}`);

    const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });

    // Get a sample of chunks from the current meeting
    const meetingChunks = await collection.get({
      where: { meetingId },
      limit: 10
    });

    if (!meetingChunks.documents || meetingChunks.documents.length === 0) {
      return [];
    }

    // Create a representative query by combining key chunks
    const representativeText = meetingChunks.documents.slice(0, 3).join(' ');
    const queryEmbedding = await generateEmbedding(representativeText);

    // Query for similar chunks from other meetings
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit * 3,
      where: {
        $and: [
          { meetingId: { $ne: meetingId } }
        ]
      }
    });

    if (!results.documents[0] || results.documents[0].length === 0) {
      return [];
    }

    // Group by meeting and calculate average similarity
    const meetingScores = {};

    results.metadatas[0].forEach((metadata, idx) => {
      if (!metadata) return;

      const otherMeetingId = metadata.meetingId;
      if (!otherMeetingId) return;

      const distance = results.distances ? results.distances[0][idx] : 0.5;
      const similarity = 1 - distance;

      if (!meetingScores[otherMeetingId]) {
        meetingScores[otherMeetingId] = {
          meetingId: otherMeetingId,
          similarities: [],
          domain: metadata.domain,
          date: metadata.date
        };
      }
      meetingScores[otherMeetingId].similarities.push(similarity);
    });

    // Calculate average similarity and get top matches
    const scoredMeetings = Object.values(meetingScores)
      .map(m => ({
        ...m,
        averageSimilarity: m.similarities.reduce((a, b) => a + b, 0) / m.similarities.length
      }))
      .sort((a, b) => b.averageSimilarity - a.averageSimilarity)
      .slice(0, limit);

    // Fetch meeting details from MongoDB
    const { Meeting } = require('../models');
    const meetingDetails = await Meeting.find({
      _id: { $in: scoredMeetings.map(m => m.meetingId) }
    }).select('name domain scheduledDate summary');

    // Merge details with scores
    return scoredMeetings.map(sm => {
      const details = meetingDetails.find(m => m._id.toString() === sm.meetingId);
      return {
        meetingId: sm.meetingId,
        name: details?.name || 'Unknown Meeting',
        domain: sm.domain || details?.domain || 'Unknown',
        date: sm.date,
        similarity: Math.round(sm.averageSimilarity * 100) / 100,
        summary: details?.summary?.substring(0, 200) || null
      };
    });
  } catch (error) {
    logger.error(`Error finding similar meetings: ${error.message}`);
    return [];
  }
}

/**
 * Query employee performance for similar trajectories
 * @param {string} userId - User ID
 * @param {Object} currentState - Current employee state
 * @returns {Promise<Array>} - Similar employees
 */
async function findSimilarEmployees(userId, currentState) {
  try {
    logger.info(`Finding similar employees for user ${userId}`);

    const embedding = await generateEmbedding(currentState.summary);

    const collection = await chromaClient.getCollection({ name: 'employee_performance' });

    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: 5,
      where: {
        $and: [
          { userId: { $ne: userId } }
        ]
      }
    });

    if (!results.documents[0]) {
      return [];
    }

    return results.documents[0].map((doc, idx) => ({
      summary: doc,
      metadata: results.metadatas[0][idx],
      similarity: results.distances ? 1 - results.distances[0][idx] : 0.5
    }));
  } catch (error) {
    logger.error(`Error finding similar employees: ${error.message}`);
    return [];
  }
}

module.exports = {
  ragMeetingQA,
  findSimilarMeetings,
  findSimilarEmployees
};
