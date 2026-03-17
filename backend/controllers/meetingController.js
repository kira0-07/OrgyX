const Meeting = require('../models/Meeting');
const { User, Notification, AuditLog, PromptTemplate } = require('../models');
const { Queue } = require('bullmq');
const { chromaClient } = require('../config/chroma');
const { queryMeetingRAG: ragMeetingQA, findSimilarMeetingsRAG: findSimilarMeetings } = require('../ai/rag');
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

// Initialize BullMQ queue
let meetingQueue;
try {
  meetingQueue = new Queue('meeting-processing', {
    connection: {
      url: process.env.REDIS_URL
    }
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

    // ✅ FIX: Notification failure never crashes createMeeting
    try {
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
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    } catch (notifErr) {
      logger.warn(`Create meeting notification failed: ${notifErr.message}`);
    }

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

    const hostId = meeting.host?._id?.toString() || meeting.host?.toString();
    const isAttendee = meeting.attendees.some(a => {
      const attendeeId = a.user?._id?.toString() || a.user?.toString();
      return attendeeId === req.user.userId;
    });

    // Allow superiors of host to view meeting
    const { getOrgTreeUsers } = require('../middleware');
    let isSuperiorOfHost = false;
    if (!isAttendee && !req.user.isAdmin && hostId !== req.user.userId) {
      const orgTree = await getOrgTreeUsers(req.user.userId);
      isSuperiorOfHost = orgTree.includes(hostId);
    }

    const hasAccess = hostId === req.user.userId ||
      isAttendee ||
      req.user.isAdmin ||
      isSuperiorOfHost;

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

    res.json({ success: true, message: 'Meeting deleted' });
  } catch (error) {
    logger.error(`Delete meeting error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to delete meeting'
    });
  }
};

// End meeting — only host, triggers AI processing if recording exists
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

    if (['completed', 'cancelled', 'processing', 'ready'].includes(meeting.status)) {
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

    meeting.endedAt = new Date();

    // ✅ Safe duration — never NaN
    if (meeting.startedAt) {
      const durationMs = meeting.endedAt - meeting.startedAt;
      meeting.actualDuration = (!isNaN(durationMs) && durationMs > 0)
        ? Math.round(durationMs / 60000)
        : 0;
    } else {
      meeting.actualDuration = 0;
    }

    // If recording exists queue for AI processing, else mark completed
    if (meeting.recordingUrl) {
      meeting.status = 'processing';
      meeting.processingSteps = [
        { step: 'upload', status: 'done', timestamp: new Date() },
        { step: 'transcription', status: 'pending' },
        { step: 'diarization', status: 'pending' },
        { step: 'analysis', status: 'pending' },
        { step: 'embedding', status: 'pending' },
        { step: 'ready', status: 'pending' }
      ];
    } else {
      meeting.status = 'completed';
    }

    await meeting.save();

    // Queue for AI processing if recording exists
    if (meeting.recordingUrl && meetingQueue) {
      try {
        await meetingQueue.add('process-meeting', {
          meetingId: id,
          audioKey: meeting.recordingUrl
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 }
        });
        logger.info(`Meeting ${id} queued for AI processing after end`);
      } catch (queueError) {
        logger.warn(`Failed to queue meeting: ${queueError.message}`);
        meeting.status = 'completed';
        await meeting.save();
      }
    }

    // ✅ FIX: Notification failure never crashes endMeeting
    try {
      const attendeeIds = meeting.attendees
        .map(a => a.user)
        .filter(uid => uid.toString() !== req.user.userId);

      if (attendeeIds.length > 0) {
        const notifications = attendeeIds.map(uid => ({
          user: uid,
          type: 'meeting_ended',
          title: `Meeting ended: ${meeting.name}`,
          message: meeting.recordingUrl
            ? `"${meeting.name}" has ended. AI summary will be ready shortly.`
            : `"${meeting.name}" has been ended by the host.`,
          link: `/meetings/${meeting._id}`,
          entityType: 'meeting',
          entityId: meeting._id
        }));
        await Notification.insertMany(notifications);
      }
    } catch (notifErr) {
      logger.warn(`End meeting notification failed: ${notifErr.message}`);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(id).emit('meeting-ended', {
        meetingId: id,
        endedAt: meeting.endedAt,
        hasRecording: !!meeting.recordingUrl
      });
    }

    await AuditLog.create({
      user: req.user.userId,
      action: 'meeting_end',
      resourceType: 'meeting',
      resourceId: id,
      newValue: {
        status: meeting.status,
        endedAt: meeting.endedAt,
        queuedForProcessing: !!meeting.recordingUrl
      },
      success: true,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: meeting.recordingUrl
        ? 'Meeting ended and queued for AI processing'
        : 'Meeting ended successfully',
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

    meeting.recordingUrl = key;
    meeting.recordingSource = 'room';
    meeting.status = 'processing';
    meeting.processingSteps.forEach(step => {
      if (step.step === 'upload') {
        step.status = 'done';
        step.timestamp = new Date();
      }
    });
    await meeting.save();

    if (meetingQueue) {
      await meetingQueue.add('process-meeting', {
        meetingId: id,
        audioKey: key
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });
    }

    res.json({
      success: true,
      message: 'Recording uploaded and queued for processing',
      meeting
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
exports.manualUpload = async (req, res) => {
  try {
    const { name, scheduledDate, domain, agenda, attendees } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file uploaded'
      });
    }

    const allowedTypes = [
      'audio/mpeg', 'audio/wav', 'audio/wave',
      'audio/x-wav', 'audio/mp4', 'audio/x-m4a'
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Allowed: MP3, WAV, M4A'
      });
    }

    if (req.file.size > 100 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size: 100MB'
      });
    }

    const host = req.user.userId;

    let parsedAttendees = [];
    try {
      parsedAttendees = typeof attendees === 'string'
        ? JSON.parse(attendees)
        : (attendees || []);
    } catch (e) {
      parsedAttendees = [];
    }

    const attendeeUsers = parsedAttendees.length > 0
      ? await User.find({
          _id: { $in: parsedAttendees.map(a => a.user || a) },
          isActive: true
        })
      : [];

    const formattedAttendees = attendeeUsers.map(user => ({ user: user._id }));

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

    const ext = path.extname(req.file.originalname) || '.mp3';
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

    const hostId = meeting.host?.toString();
    const isAttendee = meeting.attendees?.some(
      a => a.user?.toString() === req.user.userId
    );
    const hasAccess = hostId === req.user.userId || isAttendee || req.user.isAdmin;

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
        message: 'Meeting is still being processed. Please wait until status is ready.'
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

// Enrich with real meeting data from MongoDB
const enriched = await Promise.all(
  similar.map(async (s) => {
    try {
      const mtg = await Meeting.findById(s.meetingId)
        .select('name domain scheduledDate attendees status');
      if (mtg) {
        return {
          ...s,
          _id: mtg._id,
          name: mtg.name,
          domain: mtg.domain,
          scheduledDate: mtg.scheduledDate,
          attendeeCount: mtg.attendees?.length || 0,
          status: mtg.status
        };
      }
      return s;
    } catch (e) {
      return s;
    }
  })
);

res.json({
  success: true,
  similarMeetings: enriched
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

    // ✅ FIX: Notification failure never crashes scheduleFollowup
    try {
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
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    } catch (notifErr) {
      logger.warn(`Follow-up notification failed: ${notifErr.message}`);
    }

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

    res.json({ success: true, message: 'Left meeting' });
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

// Cancel meeting — only host can cancel
exports.cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hostId = meeting.host?._id?.toString() || meeting.host?.toString();
    if (hostId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only the meeting host can cancel this meeting'
      });
    }

    if (!['scheduled', 'live'].includes(meeting.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a meeting with status: ${meeting.status}`
      });
    }

    meeting.status = 'cancelled';
    await meeting.save();

    // ✅ FIX: Notification failure never crashes cancelMeeting
    try {
      const notifications = meeting.attendees
        .filter(a => a.user?.toString() !== req.user.userId)
        .map(a => ({
          user: a.user,
          type: 'meeting_cancelled',
          title: `Meeting cancelled: ${meeting.name}`,
          message: `"${meeting.name}" has been cancelled by the host.`,
          link: `/meetings/history`,
          entityType: 'meeting',
          entityId: meeting._id
        }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
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
    res.status(500).json({
      success: false,
      message: 'Failed to cancel meeting'
    });
  }
};

// ✅ Save manual speaker corrections on transcript segments
exports.updateTranscriptSegments = async (req, res) => {
  try {
    const { id } = req.params;
    const { transcriptSegments } = req.body;

    if (!transcriptSegments || !Array.isArray(transcriptSegments)) {
      return res.status(400).json({
        success: false,
        message: 'transcriptSegments must be an array'
      });
    }

    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    const hostId = meeting.host?.toString();
    const isAttendee = meeting.attendees?.some(
      a => a.user?.toString() === req.user.userId
    );
    const hasAccess = hostId === req.user.userId || isAttendee || req.user.isAdmin;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
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

    res.json({
      success: true,
      message: 'Transcript segments updated',
      meeting
    });
  } catch (error) {
    logger.error(`Update transcript segments error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update transcript segments'
    });
  }
};