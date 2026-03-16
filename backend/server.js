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
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Connect to database
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
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:3000',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));



const allowedOrigins = [
  "https://orgos-swart.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});
app.use('/api/', generalLimiter);

// Speed limiting for intensive routes
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: 500
});

// API routes
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.io setup for WebRTC and real-time
const rooms = new Map(); // meetingId -> { users: [], recording: boolean }

io.use(async (socket, next) => {
  // Authenticate socket connection
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}, user: ${socket.userId}`);

  // Join meeting room
  socket.on('join-room', ({ meetingId, userId }) => {
    socket.join(meetingId);

    if (!rooms.has(meetingId)) {
      rooms.set(meetingId, {
        users: [],
        recording: false,
        raisedHands: new Set()
      });
    }

    const room = rooms.get(meetingId);
    const userInfo = {
      socketId: socket.id,
      userId,
      peerId: null
    };
    room.users.push(userInfo);

    // Notify others about new user
    socket.to(meetingId).emit('user-connected', userId);

    // Send existing users to new user
    socket.emit('existing-users', room.users.filter(u => u.socketId !== socket.id));

    // Send recording status
    socket.emit('recording-status', room.recording);

    logger.info(`User ${userId} joined room ${meetingId}`);
  });

  // WebRTC signaling
  socket.on('offer', ({ meetingId, offer, targetUserId }) => {
    socket.to(meetingId).emit('offer', {
      offer,
      userId: socket.userId,
      targetUserId
    });
  });

  socket.on('answer', ({ meetingId, answer, targetUserId }) => {
    socket.to(meetingId).emit('answer', {
      answer,
      userId: socket.userId,
      targetUserId
    });
  });

  socket.on('ice-candidate', ({ meetingId, candidate, targetUserId }) => {
    socket.to(meetingId).emit('ice-candidate', {
      candidate,
      userId: socket.userId,
      targetUserId
    });
  });

  // Chat
  socket.on('chat-message', ({ meetingId, message }) => {
    io.to(meetingId).emit('chat-message', {
      userId: socket.userId,
      userName: `${socket.user?.firstName || ''} ${socket.user?.lastName || ''}`.trim() || 'Participant',
      message,
      timestamp: new Date().toISOString()
    });
  });

  // Raise hand
  socket.on('raise-hand', ({ meetingId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      room.raisedHands.add(socket.userId);
      io.to(meetingId).emit('hand-raised', {
        userId: socket.userId
      });
    }
  });

  socket.on('lower-hand', ({ meetingId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      room.raisedHands.delete(socket.userId);
      io.to(meetingId).emit('hand-lowered', {
        userId: socket.userId
      });
    }
  });

  // Recording
  socket.on('start-recording', ({ meetingId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      room.recording = true;
      io.to(meetingId).emit('recording-started');
    }
  });

  socket.on('stop-recording', ({ meetingId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      room.recording = false;
      io.to(meetingId).emit('recording-stopped');
    }
  });

  // Processing status updates (from workers)
  socket.on('processing-update', ({ meetingId, step, status, message }) => {
    // Only allow server workers to send this
    io.to(meetingId).emit('processing-update', {
      step,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);

    // Remove user from all rooms
    rooms.forEach((room, meetingId) => {
      const userIndex = room.users.findIndex(u => u.socketId === socket.id);
      if (userIndex > -1) {
        const userId = room.users[userIndex].userId;
        room.users.splice(userIndex, 1);
        room.raisedHands.delete(userId);
        socket.to(meetingId).emit('user-disconnected', userId);

        // Clean up empty rooms
        if (room.users.length === 0) {
          rooms.delete(meetingId);
        }
      }
    });
  });
});

// Expose io to routes
app.set('io', io);

// Error handling
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS error'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
