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

async function queryMeetingRAG(question, meetingId) {
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

async function queryEmployeeRAG(userId, currentState) {
  try {
    logger.info(`Finding similar employees for user ${userId}`);

    const embedding = await generateEmbedding(currentState.summary);
    const collection = await chromaClient.getCollection({ name: 'employee_performance' });

    // ✅ FIX: Use direct $ne instead of $and wrapping a single condition.
    // A single-item $and is invalid ChromaDB syntax — it silently ignores
    // the filter and returns results that include the current user themselves.
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

async function queryCollection(collectionName, query, filters = {}, nResults = 5) {
  try {
    const embedding = await generateEmbedding(query);
    const collection = await chromaClient.getCollection({ name: collectionName });

    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults,
      where: filters
    });

    return {
      documents: results.documents[0] || [],
      metadatas: results.metadatas[0] || [],
      distances: results.distances ? results.distances[0] : [],
      ids: results.ids ? results.ids[0] : []
    };
  } catch (error) {
    logger.error(`Error querying collection ${collectionName}: ${error.message}`);
    throw error;
  }
}

async function addToCollection(collectionName, documents, metadatas, ids) {
  try {
    const embeddings = [];
    for (const doc of documents) {
      const embedding = await generateEmbedding(doc);
      embeddings.push(embedding);
    }

    const collection = await chromaClient.getCollection({ name: collectionName });
    await collection.add({ ids, embeddings, documents, metadatas });

    logger.info(`Added ${documents.length} documents to ${collectionName}`);
  } catch (error) {
    logger.error(`Error adding to collection ${collectionName}: ${error.message}`);
    throw error;
  }
}

async function findSimilarMeetingsRAG(meetingId, limit = 3) {
  try {
    const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });

    const meetingChunks = await collection.get({ where: { meetingId } });

    if (!meetingChunks.documents || meetingChunks.documents.length === 0) {
      return [];
    }

    const combinedText = meetingChunks.documents.join(' ');
    const queryEmbedding = await generateEmbedding(combinedText.substring(0, 3000));

    // ✅ FIX: Direct $ne — same fix as queryEmployeeRAG
    const similar = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit + 10,
      where: { meetingId: { $ne: meetingId } }
    });

    const meetingScores = {};

    similar.documents[0].forEach((doc, idx) => {
      const meta = similar.metadatas[0][idx];
      const dist = similar.distances[0][idx];
      const otherMeetingId = meta.meetingId;

      if (!meetingScores[otherMeetingId]) {
        meetingScores[otherMeetingId] = {
          meetingId: otherMeetingId,
          domain: meta.domain,
          date: meta.date,
          score: 0,
          chunks: 0
        };
      }

      const similarity = 1 - (dist / 2);
      meetingScores[otherMeetingId].score += similarity;
      meetingScores[otherMeetingId].chunks += 1;
    });

    return Object.values(meetingScores)
      .map(m => ({
        ...m,
        similarity: (m.score / m.chunks).toFixed(3)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (error) {
    logger.error(`Find similar meetings error: ${error.message}`);
    return [];
  }
}

module.exports = {
  queryMeetingRAG,
  queryEmployeeRAG,
  queryCollection,
  addToCollection,
  findSimilarMeetingsRAG
};