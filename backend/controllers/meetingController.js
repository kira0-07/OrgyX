const Meeting = require('../models/Meeting');
const { User, Notification, AuditLog, PromptTemplate } = require('../models');
const { Queue } = require('bullmq');
const { chromaClient } = require('../config/chroma');
const { ragMeetingQA, findSimilarMeetings } = require('../ai/prompts');
const { uploadFile, deleteFile } = require('../config/s3');
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const { getRedisConnection } = require('../config/redisConnection');

let meetingQueue;
try {
  meetingQueue = new Queue('meeting-processing', {
    connection: getRedisConnection()
  });
} catch (error) {
  logger.error(`Failed to initialize meeting queue: ${error.message}`);
}

// Create meeting
exports.createMeeting = async (req, res) => {
  try {
    const {
      name,
      description,
      scheduledDate,
      estimatedDuration,
      domain,
      agenda,
      externalLink,
      attendees
    } = req.body;

    const host = req.user.userId;

    const attendeeUsers = await User.find({
      _id: { $in: attendees.map(a => a.user || a) },
      isActive: true
    });

    if (attendeeUsers.length !== attendees.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more attendees not found or inactive'
      });
    }

    const formattedAttendees = attendeeUsers.map(user => ({
      user: user._id
    }));

    if (!formattedAttendees.find(a => a.user.toString() === host)) {
      formattedAttendees.push({ user: host });
    }

    const meeting = new Meeting({
      name,
      description,
      scheduledDate: new Date(scheduledDate),
      estimatedDuration,
      domain,
      agenda,
      externalLink,
      host,
      attendees: formattedAttendees,
      status: 'scheduled',
      processingSteps: [
        { step: 'upload', status: 'pending' },
        { step: 'transcription', status: 'pending' },
        { step: 'diarization', status: 'pending' },
        { step: 'analysis', status: 'pending' },
        { step: 'embedding', status: 'pending' },
        { step: 'ready', status: 'pending' }
      ]
    });

    await meeting.save();

    const notifications = attendeeUsers
      .filter(u => u._id.toString() !== host)
      .map(user => ({
        user: user._id,
        type: 'meeting_invite',
        title: `Meeting invitation: ${name}`,
        message: `You've been invited to ${domain}: ${name}`,
        link: `/meetings/${meeting._id}`,
        entityType: 'meeting',
        entityId: meeting._id
      }));

    await Notification.insertMany(notifications);

    await AuditLog.create({
      user: host,
      action: 'meeting_create',
      resourceType: 'meeting',
      resourceId: meeting._id,
      newValue: { name, domain, scheduledDate },
      success: true,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Meeting scheduled successfully',
      meeting
    });
  } catch (error) {
    logger.error(`Create meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create meeting'
    });
  }
};

// Get all meetings
exports.getMeetings = async (req, res) => {
  try {
    const {
      status,
      domain,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    query.$or = [
      { host: req.user.userId },
      { 'attendees.user': req.user.userId }
    ];

    if (status) query.status = status;
    if (domain) query.domain = domain;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const meetings = await Meeting.find(query)
      .populate('host', 'firstName lastName email role')
      .populate('attendees.user', 'firstName lastName email avatar')
      .sort({ scheduledDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Meeting.countDocuments(query);

    res.json({
      success: true,
      meetings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Get meetings error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get meetings'
    });
  }
};

// Get single meeting
exports.getMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id)
      .populate('host', 'firstName lastName email role avatar')
      .populate('attendees.user', 'firstName lastName email avatar role')
      .populate('actionItems.owner', 'firstName lastName email')
      .populate('parentMeetingId', 'name scheduledDate');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hasAccess =
      meeting.host?._id?.toString() === req.user.userId ||
      meeting.attendees?.some(a => a.user?._id?.toString() === req.user.userId) ||
      req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      meeting
    });
  } catch (error) {
    logger.error(`Get meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get meeting'
    });
  }
};

// Update meeting
exports.updateMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.host.toString() !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only host can update meeting'
      });
    }

    if (['processing', 'ready'].includes(meeting.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update meeting after processing has started'
      });
    }

    const oldValue = { ...meeting.toObject() };
    Object.assign(meeting, updates);
    await meeting.save();

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_update',
      resourceType: 'meeting',
      resourceId: meeting._id,
      oldValue,
      newValue: updates,
      success: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Meeting updated',
      meeting
    });
  } catch (error) {
    logger.error(`Update meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update meeting'
    });
  }
};

// Delete meeting
exports.deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.host.toString() !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only host can delete meeting'
      });
    }

    if (meeting.recordingUrl) {
      try {
        const key = meeting.recordingUrl.split('/').pop();
        await deleteFile(`meetings/${id}/${key}`);
      } catch (err) {
        logger.warn(`Failed to delete recording: ${err.message}`);
      }
    }

    try {
      const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });
      await collection.delete({ where: { meetingId: id } });
    } catch (err) {
      logger.warn(`Failed to delete from ChromaDB: ${err.message}`);
    }

    await Meeting.findByIdAndDelete(id);

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_delete',
      resourceType: 'meeting',
      resourceId: id,
      success: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Meeting deleted'
    });
  } catch (error) {
    logger.error(`Delete meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to delete meeting'
    });
  }
};

// End meeting
exports.endMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.host.toString() !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can end this meeting'
      });
    }

    if (['completed', 'cancelled'].includes(meeting.status)) {
      return res.status(400).json({
        success: false,
        message: `Meeting is already ${meeting.status}`
      });
    }

    meeting.attendees.forEach(attendee => {
      if (attendee.attended && !attendee.leftAt) {
        attendee.leftAt = new Date();
      }
    });

    meeting.status = 'completed';
    meeting.endedAt = new Date();

    if (meeting.startedAt) {
      meeting.actualDuration = Math.round(
        (meeting.endedAt - meeting.startedAt) / 60000
      );
    }

    await meeting.save();

    const attendeeIds = meeting.attendees
      .map(a => a.user)
      .filter(uid => uid.toString() !== req.user.userId);

    if (attendeeIds.length > 0) {
      const notifications = attendeeIds.map(uid => ({
        user: uid,
        type: 'meeting_ended',
        title: `Meeting ended: ${meeting.name}`,
        message: `The meeting "${meeting.name}" has been ended by the host.`,
        link: `/meetings/${meeting._id}`,
        entityType: 'meeting',
        entityId: meeting._id
      }));
      await Notification.insertMany(notifications);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('meeting-ended', {
        meetingId: id,
        endedAt: meeting.endedAt
      });
    }

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_end',
      resourceType: 'meeting',
      resourceId: id,
      newValue: { status: 'completed', endedAt: meeting.endedAt },
      success: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Meeting ended successfully',
      meeting
    });
  } catch (error) {
    logger.error(`End meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to end meeting'
    });
  }
};

// Upload recording from room
exports.uploadRecording = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.host.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only host can upload recording'
      });
    }

    const key = `meetings/${id}/recording-${Date.now()}.webm`;
    await uploadFile(key, req.file.buffer, req.file.mimetype);

    let perDeviceAudio = null;
    try {
      if (req.body.perDeviceAudio) {
        perDeviceAudio = typeof req.body.perDeviceAudio === 'string'
          ? JSON.parse(req.body.perDeviceAudio)
          : req.body.perDeviceAudio;
        logger.info(`Per-device audio received for ${perDeviceAudio.length} participants`);
      }
    } catch (e) {
      logger.warn(`Failed to parse perDeviceAudio: ${e.message}`);
    }

    // Save meeting state BEFORE queuing so the worker never reads stale data
    meeting.recordingUrl = key;
    meeting.recordingSource = 'room';
    meeting.status = 'processing';
    meeting.processingSteps.forEach(step => {
      if (step.step === 'upload') {
        step.status = 'done';
        step.timestamp = new Date();
      }
    });

    if (perDeviceAudio && perDeviceAudio.length > 0) {
      meeting.perDeviceAudioKeys = perDeviceAudio;
    }

    await meeting.save();

    // Queue AFTER save — worker is guaranteed to see the fully updated document
    let jobId = null;
    if (meetingQueue) {
      const jobData = {
        meetingId: id,
        audioKey: key,
        ...(perDeviceAudio && perDeviceAudio.length > 0 ? { perDeviceAudio } : {})
      };

      const job = await meetingQueue.add('process-meeting', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });
      jobId = job.id;
      logger.info(`Job ${jobId} queued for meeting ${id}`);
    }

    res.json({
      success: true,
      message: 'Recording uploaded and queued for processing',
      meeting,
      jobId
    });
  } catch (error) {
    logger.error(`Upload recording error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to upload recording'
    });
  }
};

// Manual audio upload
// FIX: Removed duplicate MIME type check — the router-level multer fileFilter
// is the single gatekeeper. The old list here excluded audio/webm which caused
// browser-recorded files to be rejected with 400 after passing multer.
// FIX: attendees now parsed from JSON string (FormData always sends strings).
// FIX: Falls back to .webm extension for browser blobs with no extension.
exports.manualUpload = async (req, res) => {
  try {
    const {
      name,
      scheduledDate,
      domain,
      agenda,
      attendees
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file uploaded. Accepted formats: MP3, WAV, M4A, WebM, OGG, AAC (max 100 MB).'
      });
    }

    // Belt-and-suspenders size guard
    if (req.file.size > 100 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size: 100 MB.'
      });
    }

    const host = req.user.userId;

    // FormData always sends values as strings — parse attendees if needed
    let parsedAttendees = attendees;
    if (typeof attendees === 'string') {
      try {
        parsedAttendees = JSON.parse(attendees);
      } catch (e) {
        parsedAttendees = [attendees];
      }
    }

    const attendeeUsers = await User.find({
      _id: { $in: (parsedAttendees || []).map(a => a.user || a) },
      isActive: true
    });

    const formattedAttendees = attendeeUsers.map(user => ({
      user: user._id
    }));

    if (!formattedAttendees.find(a => a.user.toString() === host)) {
      formattedAttendees.push({ user: host });
    }

    const meeting = new Meeting({
      name,
      scheduledDate: new Date(scheduledDate),
      domain,
      agenda,
      host,
      attendees: formattedAttendees,
      status: 'processing',
      recordingSource: 'upload',
      processingSteps: [
        { step: 'upload', status: 'done', timestamp: new Date() },
        { step: 'transcription', status: 'running' },
        { step: 'diarization', status: 'pending' },
        { step: 'analysis', status: 'pending' },
        { step: 'embedding', status: 'pending' },
        { step: 'ready', status: 'pending' }
      ]
    });

    // Preserve original extension; fall back to .webm for browser blobs
    // that have no extension in their originalname (e.g. "blob")
    const ext = path.extname(req.file.originalname) || '.webm';
    const key = `meetings/${meeting._id}/upload-${Date.now()}${ext}`;

    await uploadFile(key, req.file.buffer, req.file.mimetype);

    meeting.recordingUrl = key;
    await meeting.save();

    if (meetingQueue) {
      await meetingQueue.add('process-meeting', {
        meetingId: meeting._id.toString(),
        audioKey: key
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });
    }

    logger.info(`Manual upload complete for meeting ${meeting._id}, key: ${key}`);

    res.status(201).json({
      success: true,
      message: 'Audio uploaded and queued for processing',
      meeting
    });
  } catch (error) {
    logger.error(`Manual upload error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to upload audio'
    });
  }
};

// Get processing status
exports.getProcessingStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id)
      .select('status processingSteps processingError host attendees');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hasAccess =
      meeting.host?.toString() === req.user.userId ||
      meeting.attendees?.some(a => a.user?.toString() === req.user.userId) ||
      req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      status: meeting.status,
      processingSteps: meeting.processingSteps,
      error: meeting.processingError
    });
  } catch (error) {
    logger.error(`Get processing status error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get processing status'
    });
  }
};

// RAG Q&A
exports.meetingQA = async (req, res) => {
  try {
    const { id } = req.params;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hasAccess =
      meeting.host.toString() === req.user.userId ||
      meeting.attendees.some(a => a.user.toString() === req.user.userId) ||
      req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (meeting.status !== 'ready') {
      return res.status(400).json({
        success: false,
        message: 'Meeting is still being processed'
      });
    }

    const result = await ragMeetingQA(question, id);

    res.json({
      success: true,
      answer: result.answer,
      sources: result.sources
    });
  } catch (error) {
    logger.error(`Meeting QA error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to process question'
    });
  }
};

// Get similar meetings
exports.getSimilarMeetings = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hasAccess =
      meeting.host.toString() === req.user.userId ||
      meeting.attendees.some(a => a.user.toString() === req.user.userId) ||
      req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const similar = await findSimilarMeetings(id, 3);

    res.json({
      success: true,
      similarMeetings: similar
    });
  } catch (error) {
    logger.error(`Get similar meetings error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get similar meetings'
    });
  }
};

// Schedule follow-up meeting
exports.scheduleFollowup = async (req, res) => {
  try {
    const { id } = req.params;
    const meetingData = req.body;

    const parentMeeting = await Meeting.findById(id);

    if (!parentMeeting) {
      return res.status(404).json({
        success: false,
        message: 'Parent meeting not found'
      });
    }

    const hasAccess =
      parentMeeting.host.toString() === req.user.userId ||
      req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Only host can schedule follow-up'
      });
    }

    const followUpMeeting = new Meeting({
      ...meetingData,
      host: req.user.userId,
      attendees: meetingData.attendees || parentMeeting.attendees,
      domain: meetingData.domain || parentMeeting.domain,
      agenda: meetingData.agenda || parentMeeting.followUpTopics?.join('\n'),
      parentMeetingId: parentMeeting._id,
      status: 'scheduled',
      processingSteps: [
        { step: 'upload', status: 'pending' },
        { step: 'transcription', status: 'pending' },
        { step: 'diarization', status: 'pending' },
        { step: 'analysis', status: 'pending' },
        { step: 'embedding', status: 'pending' },
        { step: 'ready', status: 'pending' }
      ]
    });

    await followUpMeeting.save();

    parentMeeting.childMeetingIds.push(followUpMeeting._id);
    await parentMeeting.save();

    const notifications = followUpMeeting.attendees
      .filter(a => a.user.toString() !== req.user.userId)
      .map(a => ({
        user: a.user,
        type: 'follow_up_reminder',
        title: 'Follow-up meeting scheduled',
        message: `A follow-up to "${parentMeeting.name}" has been scheduled`,
        link: `/meetings/${followUpMeeting._id}`,
        entityType: 'meeting',
        entityId: followUpMeeting._id
      }));

    await Notification.insertMany(notifications);

    res.status(201).json({
      success: true,
      message: 'Follow-up meeting scheduled',
      meeting: followUpMeeting
    });
  } catch (error) {
    logger.error(`Schedule follow-up error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule follow-up'
    });
  }
};

// Join meeting
exports.joinMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const attendeeIndex = meeting.attendees.findIndex(
      a => a.user.toString() === req.user.userId
    );

    if (attendeeIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'Not invited to this meeting'
      });
    }

    meeting.attendees[attendeeIndex].attended = true;
    meeting.attendees[attendeeIndex].joinedAt = new Date();

    if (meeting.status === 'scheduled') {
      meeting.status = 'live';
      meeting.startedAt = new Date();
    }

    await meeting.save();

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_join',
      resourceType: 'meeting',
      resourceId: id,
      success: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Joined meeting',
      meeting
    });
  } catch (error) {
    logger.error(`Join meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to join meeting'
    });
  }
};

// Leave meeting
exports.leaveMeeting = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const attendeeIndex = meeting.attendees.findIndex(
      a => a.user.toString() === req.user.userId
    );

    if (attendeeIndex > -1) {
      meeting.attendees[attendeeIndex].leftAt = new Date();
    }

    await meeting.save();

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_leave',
      resourceType: 'meeting',
      resourceId: id,
      success: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Left meeting'
    });
  } catch (error) {
    logger.error(`Leave meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to leave meeting'
    });
  }
};

// Export meeting to PDF
exports.exportToPDF = async (req, res) => {
  try {
    const { id } = req.params;

    const meeting = await Meeting.findById(id)
      .populate('host', 'firstName lastName')
      .populate('attendees.user', 'firstName lastName');

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hasAccess =
      meeting.host._id.toString() === req.user.userId ||
      meeting.attendees.some(a => a.user._id.toString() === req.user.userId) ||
      req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      message: 'PDF generation endpoint',
      data: { meeting, generatedAt: new Date() }
    });
  } catch (error) {
    logger.error(`Export PDF error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to export PDF'
    });
  }
};

// Cancel meeting
exports.cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const hostId = meeting.host?._id?.toString() || meeting.host?.toString();
    if (hostId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Only the meeting host can cancel this meeting' });
    }

    if (!['scheduled', 'live'].includes(meeting.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a meeting with status: ${meeting.status}` });
    }

    meeting.status = 'cancelled';
    await meeting.save();

    try {
      const notifications = meeting.attendees
        .filter(a => a.user?.toString() !== req.user.userId)
        .map(a => ({
          user: a.user,
          type: 'meeting_cancelled',
          title: `Meeting cancelled: ${meeting.name}`,
          message: `"${meeting.name}" has been cancelled by the host.`,
          link: '/meetings/history',
          entityType: 'meeting',
          entityId: meeting._id
        }));
      if (notifications.length > 0) await Notification.insertMany(notifications);
    } catch (notifErr) {
      logger.warn(`Cancel meeting notification failed: ${notifErr.message}`);
    }

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_cancel',
      resourceType: 'meeting',
      resourceId: id,
      success: true,
      ipAddress: req.ip
    });

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('meeting-cancelled', {
        meetingId: id,
        message: 'This meeting has been cancelled by the host'
      });
    }

    res.json({ success: true, message: 'Meeting cancelled', meeting });
  } catch (error) {
    logger.error(`Cancel meeting error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to cancel meeting' });
  }
};

// Save manual speaker corrections on transcript segments
exports.updateTranscriptSegments = async (req, res) => {
  try {
    const { id } = req.params;
    const { transcriptSegments } = req.body;

    if (!transcriptSegments || !Array.isArray(transcriptSegments)) {
      return res.status(400).json({ success: false, message: 'transcriptSegments must be an array' });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const hostId = meeting.host?.toString();
    const isAttendee = meeting.attendees?.some(a => a.user?.toString() === req.user.userId);
    const hasAccess = hostId === req.user.userId || isAttendee || req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    meeting.transcriptSegments = transcriptSegments;
    await meeting.save();

    await AuditLog.create({
      user: req.user.userId,
      action: 'transcript_correction',
      resourceType: 'meeting',
      resourceId: id,
      newValue: { segmentsUpdated: transcriptSegments.length },
      success: true,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Transcript segments updated', meeting });
  } catch (error) {
    logger.error(`Update transcript segments error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to update transcript segments' });
  }
};