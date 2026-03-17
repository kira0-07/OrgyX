const express = require('express');
const router = express.Router();
const multer = require('multer');
const { meetingController } = require('../controllers');
const { authMiddleware } = require('../middleware');

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: MP3, WAV, M4A, WebM'));
    }
  }
});

router.use(authMiddleware);

// Meeting CRUD
router.get('/', meetingController.getMeetings);
router.post('/', meetingController.createMeeting);
router.get('/:id', meetingController.getMeeting);
router.put('/:id', meetingController.updateMeeting);
router.delete('/:id', meetingController.deleteMeeting);
router.post('/:id/cancel', meetingController.cancelMeeting);

// Room routes
router.post('/:id/join', meetingController.joinMeeting);
router.post('/:id/leave', meetingController.leaveMeeting);
router.post('/:id/end', meetingController.endMeeting);
router.post('/:id/upload-recording', upload.single('recording'), meetingController.uploadRecording);

// Manual upload
router.post('/upload', upload.single('audio'), meetingController.manualUpload);

// Processing status
router.get('/:id/processing-status', meetingController.getProcessingStatus);

// RAG Q&A
router.post('/:id/qa', meetingController.meetingQA);

// Similar meetings
router.get('/:id/similar', meetingController.getSimilarMeetings);

// Schedule follow-up
router.post('/:id/schedule-followup', meetingController.scheduleFollowup);

// Export to PDF
router.get('/:id/export', meetingController.exportToPDF);

// ✅ Save manual speaker corrections on transcript
router.put('/:id/transcript-segments', meetingController.updateTranscriptSegments);

module.exports = router;