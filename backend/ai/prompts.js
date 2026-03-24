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

async function ragMeetingQA(question, meetingId) {
  try {
    logger.info(`RAG query for meeting ${meetingId}: ${question}`);

    const questionEmbedding = await generateEmbedding(question);
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

    const context = results.documents[0]
      .map((doc, idx) => {
        const metadata = results.metadatas[0][idx];
        const timestamp = metadata?.timestamp || 'Unknown time';
        const speaker = metadata?.speaker || 'Unknown speaker';
        return `[${timestamp}] ${speaker}: ${doc}`;
      })
      .join('\n\n');

    const chain = await createRAGChain();
    const answer = await chain.invoke({ context, question });

    const sources = results.documents[0].map((doc, idx) => ({
      text: doc,
      metadata: results.metadatas[0][idx],
      relevanceScore: results.distances ? 1 - results.distances[0][idx] : 0.5
    }));

    return { answer, sources };
  } catch (error) {
    logger.error(`Error in RAG meeting QA: ${error.message}`);
    return {
      answer: 'Sorry, I encountered an error while processing your question.',
      sources: [],
      error: error.message
    };
  }
}

async function findSimilarMeetings(meetingId, limit = 3) {
  try {
    logger.info(`Finding similar meetings to ${meetingId}`);

    const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });

    const meetingChunks = await collection.get({
      where: { meetingId },
      limit: 10
    });

    if (!meetingChunks.documents || meetingChunks.documents.length === 0) {
      return [];
    }

    const representativeText = meetingChunks.documents.slice(0, 3).join(' ');
    const queryEmbedding = await generateEmbedding(representativeText);

    // ✅ FIX: Use direct $ne instead of $and wrapping a single condition.
    // ChromaDB requires $and to have at least 2 conditions — a single-item
    // $and silently ignores the filter, returning ALL meetings including the
    // current one as "similar" to itself.
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit * 3,
      where: {
        meetingId: { $ne: meetingId }
      }
    });

    if (!results.documents[0] || results.documents[0].length === 0) {
      return [];
    }

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

    const scoredMeetings = Object.values(meetingScores)
      .map(m => ({
        ...m,
        averageSimilarity: m.similarities.reduce((a, b) => a + b, 0) / m.similarities.length
      }))
      .sort((a, b) => b.averageSimilarity - a.averageSimilarity)
      .slice(0, limit);

    const { Meeting } = require('../models');
    const meetingDetails = await Meeting.find({
      _id: { $in: scoredMeetings.map(m => m.meetingId) }
    }).select('name domain scheduledDate summary');

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

async function findSimilarEmployees(userId, currentState) {
  try {
    logger.info(`Finding similar employees for user ${userId}`);

    const embedding = await generateEmbedding(currentState.summary);
    const collection = await chromaClient.getCollection({ name: 'employee_performance' });

    // ✅ FIX: Same fix — direct $ne instead of invalid single-item $and
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: 5,
      where: {
        userId: { $ne: userId }
      }
    });

    if (!results.documents[0]) return [];

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