const { pipeline } = require('@xenova/transformers');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    logger.info('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true
    });
    logger.info('Embedding model loaded successfully');
  }
  return embedder;
}

async function generateEmbedding(text) {
  try {
    const embed = await getEmbedder();

    // Truncate text if too long (model has 512 token limit)
    const truncatedText = text.length > 1000 ? text.substring(0, 1000) + '...' : text;

    const output = await embed(truncatedText, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to regular array
    return Array.from(output.data);
  } catch (error) {
    logger.error(`Error generating embedding: ${error.message}`);
    throw error;
  }
}

async function generateEmbeddingsBatch(texts) {
  try {
    const embed = await getEmbedder();
    const embeddings = [];

    for (const text of texts) {
      const truncatedText = text.length > 1000 ? text.substring(0, 1000) + '...' : text;
      const output = await embed(truncatedText, {
        pooling: 'mean',
        normalize: true
      });
      embeddings.push(Array.from(output.data));
    }

    return embeddings;
  } catch (error) {
    logger.error(`Error generating batch embeddings: ${error.message}`);
    throw error;
  }
}

// Calculate cosine similarity between two embeddings
function cosineSimilarity(embeddingA, embeddingB) {
  if (embeddingA.length !== embeddingB.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < embeddingA.length; i++) {
    dotProduct += embeddingA[i] * embeddingB[i];
    normA += embeddingA[i] * embeddingA[i];
    normB += embeddingB[i] * embeddingB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  cosineSimilarity,
  getEmbedder
};
