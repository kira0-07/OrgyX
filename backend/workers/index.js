// Initialize environment variables
require('dotenv').config();

// MongoDB connection
const connectDB = require('../config/db');

// Logger
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// ── Connect worker to backend via Socket.io client ───────────────────────────
// Worker is a separate process — it can't use server.js's io directly.
// Instead it connects as a socket client and emits processing-update events,
// which server.js then re-broadcasts to the meeting room.
const { io: socketIOClient } = require('socket.io-client');

const BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:5001';

const workerSocket = socketIOClient(BACKEND_URL, {
  auth: { token: process.env.WORKER_SOCKET_TOKEN || 'worker-internal' },
  reconnection: true,
  reconnectionDelay: 3000,
  transports: ['websocket']
});

workerSocket.on('connect', () => {
  logger.info(`Worker socket connected to backend: ${workerSocket.id}`);
});

workerSocket.on('connect_error', (err) => {
  logger.warn(`Worker socket connection failed: ${err.message} — processing updates disabled`);
});

// Set global.io as a proxy that emits via the socket client
// Worker calls global.io.to(meetingId).emit(...) just like server.js does
global.io = {
  to: (meetingId) => ({
    emit: (event, data) => {
      if (workerSocket.connected) {
        workerSocket.emit('worker-broadcast', { meetingId, event, data });
      }
    }
  })
};
// ─────────────────────────────────────────────────────────────────────────────

// Import all workers
const meetingProcessor = require('./meetingProcessor');
const performanceScorer = require('./performanceScorer');
const recommendationEngine = require('./recommendationEngine');
const promotionAnalyzer = require('./promotionAnalyzer');
const resignationPredictor = require('./resignationPredictor');

// Start worker system
const startWorkers = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected for workers');
    logger.info('All workers initialized');
  } catch (error) {
    logger.error(`Worker initialization failed: ${error.message}`);
    process.exit(1);
  }
};

startWorkers();

module.exports = {
  meetingProcessor,
  performanceScorer,
  recommendationEngine,
  promotionAnalyzer,
  resignationPredictor
};
