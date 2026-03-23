const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attended: { type: Boolean, default: false },
  joinedAt: { type: Date, default: null },
  leftAt: { type: Date, default: null },
  contributionScore: { type: Number, min: 0, max: 10, default: null },
  speakingTime: { type: Number, default: 0 },
  keyPoints: [{ type: String }]
});

const actionItemSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  task: { type: String, required: true },
  deadline: { type: Date, default: null },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  completedAt: { type: Date, default: null }
});

const processingStepSchema = new mongoose.Schema({
  step: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'running', 'done', 'failed'],
    default: 'pending'
  },
  timestamp: { type: Date, default: Date.now },
  message: { type: String, default: null }
});

const meetingSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  scheduledDate: { type: Date, required: true },
  estimatedDuration: { type: Number, default: 0 },
  actualDuration: { type: Number, default: null },
  domain: {
    type: String,
    required: true,
    enum: ['Sprint Planning', 'Performance Review', 'Architecture Discussion', '1:1', 'All-Hands', 'Custom']
  },
  agenda: { type: String, default: '' },
  externalLink: { type: String, default: null },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [attendeeSchema],
  status: {
    type: String,
    enum: ['scheduled', 'live', 'completed', 'processing', 'ready', 'cancelled'],
    default: 'scheduled'
  },
  recordingUrl: { type: String, default: null },
  recordingSource: {
    type: String,
    enum: ['room', 'upload', null],
    default: null
  },
  // ── PERMANENT FIX: store per-device S3 keys so requeue script can find them ──
  perDeviceAudioKeys: [{
    userId: String,
    userName: String,
    audioKey: String
  }],
  transcriptRaw: { type: String, default: null },
  transcriptSegments: [{
    speaker: String,
    text: String,
    startTime: Number,
    endTime: Number,
    confidence: Number
  }],
  summary: { type: String, default: null },
  conclusions: [{ type: String }],
  decisions: [{ type: String }],
  actionItems: [actionItemSchema],
  followUpTopics: [{ type: String }],
  attendeeContributions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: Number,
    keyPoints: [String],
    speakingTime: Number
  }],
  parentMeetingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    default: null
  },
  childMeetingIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting'
  }],
  processingSteps: [processingStepSchema],
  processingError: { type: String, default: null },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  isRecording: { type: Boolean, default: false },
  recordingStartedAt: { type: Date, default: null },
  recordingStoppedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Indexes
meetingSchema.index({ host: 1 });
meetingSchema.index({ scheduledDate: -1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ domain: 1 });
meetingSchema.index({ 'attendees.user': 1 });
meetingSchema.index({ parentMeetingId: 1 });
meetingSchema.index({ createdAt: -1 });

meetingSchema.virtual('attendeeCount').get(function() {
  return this.attendees.length;
});

meetingSchema.virtual('duration').get(function() {
  if (this.actualDuration) return this.actualDuration;
  if (this.startedAt && this.endedAt) {
    return Math.round((this.endedAt - this.startedAt) / 60000);
  }
  return this.estimatedDuration;
});

module.exports = mongoose.model('Meeting', meetingSchema);