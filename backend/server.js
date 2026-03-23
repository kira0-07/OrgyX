require('dotenv').config();

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

const connectDB = require('./config/db');
const { initializeCollections } = require('./config/chroma');

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

const allowedOrigins = [
  'https://orgos-swart.vercel.app',
  'https://team-catalyst-v2-0.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  // Increase max payload for audio chunk uploads
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB
});

connectDB();
initializeCollections().catch(err =>
  logger.error(`ChromaDB initialization failed: ${err.message}`)
);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', generalLimiter);

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: 500
});

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-device transcript queue
// Structure: transcriptQueue[meetingId] = [
//   { userId, userName, timestamp, audioBuffer, transcriptText }
// ]
// ─────────────────────────────────────────────────────────────────────────────
const transcriptQueue = new Map();

// Store participant names per room so we can use them for transcript labeling
const roomParticipants = new Map(); // meetingId → { userId: userName }

// Per-device audio S3 upload helper
const { uploadFile } = require('./config/s3');

const rooms = new Map();

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
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

  // Build display name from JWT (now includes firstName/lastName)
  const getDisplayName = () => {
    const first = socket.user?.firstName || '';
    const last = socket.user?.lastName || '';
    return `${first} ${last}`.trim() || socket.user?.email || 'Participant';
  };

  socket.on('join-room', ({ meetingId, userId }) => {
    socket.join(meetingId);

    if (!rooms.has(meetingId)) {
      rooms.set(meetingId, { users: [], recording: false, raisedHands: new Set() });
    }
    if (!roomParticipants.has(meetingId)) {
      roomParticipants.set(meetingId, {});
    }

    const room = rooms.get(meetingId);
    const participants = roomParticipants.get(meetingId);

    // Register this participant's name in the room
    const displayName = getDisplayName();
    participants[userId] = displayName;

    room.users.push({ socketId: socket.id, userId: userId?.toString(), displayName });

    // Tell other participants this person joined (with their name)
    socket.to(meetingId).emit('user-connected', userId);

    // Send existing users list + participant names map to the new joiner
    socket.emit('existing-users', room.users
      .filter(u => u.socketId !== socket.id)
      .map(u => ({ userId: u.userId?.toString(), displayName: u.displayName }))
    );
    socket.emit('participant-names', participants); // ← NEW: send full name map
    socket.emit('recording-status', room.recording);

    // Update everyone's participant name map
    io.to(meetingId).emit('participant-joined', { userId, displayName });
  });

  socket.on('offer', ({ meetingId, offer, targetUserId }) => {
    // Route offer only to the target user, not broadcast to everyone
    const room = rooms.get(meetingId);
    if (room) {
      const targetUser = room.users.find(u => u.userId?.toString() === targetUserId?.toString());
      if (targetUser) {
        io.to(targetUser.socketId).emit('offer', { offer, userId: socket.userId });
      } else {
        // Fallback: broadcast to room
        socket.to(meetingId).emit('offer', { offer, userId: socket.userId });
      }
    }
  });

  socket.on('answer', ({ meetingId, answer, targetUserId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      const targetUser = room.users.find(u => u.userId?.toString() === targetUserId?.toString());
      if (targetUser) {
        io.to(targetUser.socketId).emit('answer', { answer, userId: socket.userId });
      } else {
        socket.to(meetingId).emit('answer', { answer, userId: socket.userId });
      }
    }
  });

  socket.on('ice-candidate', ({ meetingId, candidate, targetUserId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      const targetUser = room.users.find(u => u.userId?.toString() === targetUserId?.toString());
      if (targetUser) {
        io.to(targetUser.socketId).emit('ice-candidate', { candidate, userId: socket.userId });
      } else {
        socket.to(meetingId).emit('ice-candidate', { candidate, userId: socket.userId });
      }
    }
  });

  // FIX: Chat message now always uses real name from JWT
  socket.on('chat-message', ({ meetingId, message }) => {
    const displayName = getDisplayName();
    io.to(meetingId).emit('chat-message', {
      userId: socket.userId,
      userName: displayName,
      message,
      timestamp: new Date().toISOString()
    });
  });

  // ── Per-device audio chunk for transcription ──────────────────────────────
  // Each participant sends their own audio chunks every 30s
  // Payload: { meetingId, audioChunk: ArrayBuffer, timestamp: number }
  socket.on('audio-chunk', ({ meetingId, audioChunk, timestamp }) => {
    if (!transcriptQueue.has(meetingId)) {
      transcriptQueue.set(meetingId, []);
    }
    const queue = transcriptQueue.get(meetingId);
    const displayName = getDisplayName();

    queue.push({
      userId: socket.userId,
      userName: displayName,
      timestamp: timestamp || Date.now(),
      audioBuffer: Buffer.from(audioChunk),
      transcriptText: null // filled in by worker after transcription
    });

    logger.info(`Audio chunk queued for ${displayName} in meeting ${meetingId}, queue size: ${queue.length}`);
  });

  // ── Host requests per-device audio upload when meeting ends ─────────────
  // Server merges each participant's chunks, uploads to S3, returns S3 keys
  // Worker then transcribes each person's audio separately — no diarization needed
  socket.on('get-transcript-queue', async ({ meetingId }) => {
    const queue = transcriptQueue.get(meetingId) || [];
    if (queue.length === 0) {
      socket.emit('transcript-queue', { meetingId, chunks: [] });
      return;
    }

    // Group chunks by userId
    const byUser = {};
    for (const chunk of queue) {
      if (!byUser[chunk.userId]) {
        byUser[chunk.userId] = { userId: chunk.userId, userName: chunk.userName, buffers: [] };
      }
      byUser[chunk.userId].buffers.push(chunk.audioBuffer);
    }

    logger.info(`Uploading per-device audio for ${Object.keys(byUser).length} participants`);

    const perDeviceAudio = [];

    for (const [userId, data] of Object.entries(byUser)) {
      try {
        // Merge all chunks for this user into one buffer
        const merged = Buffer.concat(data.buffers);
        const audioKey = `meetings/${meetingId}/device-${userId}-${Date.now()}.webm`;
        await uploadFile(audioKey, merged, 'audio/webm');
        perDeviceAudio.push({
          userId,
          userName: data.userName,
          audioKey
        });
        logger.info(`Uploaded audio for ${data.userName}: ${audioKey} (${merged.length} bytes)`);
      } catch (e) {
        logger.warn(`Failed to upload audio for ${data.userName}: ${e.message}`);
      }
    }

    socket.emit('transcript-queue', {
      meetingId,
      perDeviceAudio // array of { userId, userName, audioKey }
    });

    logger.info(`Per-device audio upload complete: ${perDeviceAudio.length} participants`);
  });

  socket.on('raise-hand', ({ meetingId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      room.raisedHands.add(socket.userId);
      io.to(meetingId).emit('hand-raised', { userId: socket.userId });
    }
  });

  socket.on('lower-hand', ({ meetingId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      room.raisedHands.delete(socket.userId);
      io.to(meetingId).emit('hand-lowered', { userId: socket.userId });
    }
  });

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

  // Relay peer-restart to the target user so both sides destroy and recreate cleanly
  socket.on('peer-restart', ({ meetingId, targetUserId }) => {
    const room = rooms.get(meetingId);
    if (room) {
      const targetUser = room.users.find(u => u.userId?.toString() === targetUserId?.toString());
      if (targetUser) {
        io.to(targetUser.socketId).emit('peer-restart', { userId: socket.userId });
        logger.info(`Peer restart relayed from ${socket.userId} to ${targetUserId}`);
      }
    }
  });

  socket.on('processing-update', ({ meetingId, step, status, message }) => {
    io.to(meetingId).emit('processing-update', {
      step, status, message,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    rooms.forEach((room, meetingId) => {
      const userIndex = room.users.findIndex(u => u.socketId === socket.id);
      if (userIndex > -1) {
        const userId = room.users[userIndex].userId;
        room.users.splice(userIndex, 1);
        room.raisedHands.delete(userId);
        socket.to(meetingId).emit('user-disconnected', userId);
        if (room.users.length === 0) {
          rooms.delete(meetingId);
          // Clean up transcript queue when room is empty
          // Keep it for a bit in case worker needs it
          setTimeout(() => {
            if (!rooms.has(meetingId)) {
              transcriptQueue.delete(meetingId);
              roomParticipants.delete(meetingId);
            }
          }, 30 * 60 * 1000); // 30 min
        }
      }
    });
  });
});

app.set('io', io);

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `File upload error: ${err.message}` });
  }
  if (err.message === 'CORS not allowed' || err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'CORS error' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Allowed origins: ${allowedOrigins.join(', ')}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };