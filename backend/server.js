require('dotenv').config();

console.log("JWT_SECRET =", process.env.JWT_SECRET);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const winston = require('winston');
const path = require('path');

// Import configs
const connectDB = require('./config/db');
const { initializeCollections } = require('./config/chroma');

// Import routes
const {
  authRoutes,
  userRoutes,
  meetingRoutes,
  taskRoutes,
  sprintRoutes,
  attendanceRoutes,
  performanceRoutes,
  recommendationRoutes,
  notificationRoutes,
  auditRoutes,
  dashboardRoutes,
  adminRoutes
} = require('./routes');

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Initialize app
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
  }
});

// Connect DB
connectDB();

// Initialize ChromaDB
initializeCollections().catch(err =>
  logger.error(`ChromaDB initialization failed: ${err.message}`)
);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});

app.use('/api/', generalLimiter);

// Speed limiter
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: () => 500
});

// =======================
// API ROUTES
// =======================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/sprints', sprintRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/performance', speedLimiter, performanceRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);

// =======================
// ROOT ROUTE
// =======================

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: "OrgOS Backend API Running 🚀",
    documentation: "/api",
    health: "/health",
    timestamp: new Date().toISOString()
  });
});

// API index
app.get('/api', (req, res) => {
  res.json({
    message: "OrgOS API Endpoints",
    endpoints: [
      "/api/auth",
      "/api/users",
      "/api/meetings",
      "/api/tasks",
      "/api/sprints",
      "/api/attendance",
      "/api/performance",
      "/api/recommendations",
      "/api/notifications",
      "/api/audit",
      "/api/dashboard",
      "/api/admin"
    ]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// =======================
// SOCKET.IO
// =======================

const rooms = new Map();

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

app.set('io', io);

// =======================
// ERROR HANDLING
// =======================

app.use((err, req, res, next) => {
  logger.error(err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// =======================
// 404 HANDLER
// =======================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// =======================
// START SERVER
// =======================

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };