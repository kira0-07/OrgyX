// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const { meetingController } = require('../controllers');
// const { authMiddleware } = require('../middleware');

// // Configure multer
// const storage = multer.memoryStorage();
// const upload = multer({
//   storage,
//   limits: {
//     fileSize: 100 * 1024 * 1024 // 100MB
//   },
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];
//     if (allowedTypes.includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error('Invalid file type. Allowed: MP3, WAV, M4A, WebM'));
//     }
//   }
// });

// router.use(authMiddleware);

// // Meeting CRUD
// router.get('/', meetingController.getMeetings);
// router.post('/', meetingController.createMeeting);
// router.get('/:id', meetingController.getMeeting);
// router.put('/:id', meetingController.updateMeeting);
// router.delete('/:id', meetingController.deleteMeeting);
// router.post('/:id/cancel', meetingController.cancelMeeting);

// // Room routes
// router.post('/:id/join', meetingController.joinMeeting);
// router.post('/:id/leave', meetingController.leaveMeeting);
// router.post('/:id/end', meetingController.endMeeting);
// router.post('/:id/upload-recording', upload.single('recording'), meetingController.uploadRecording);

// // Manual upload
// router.post('/upload', upload.single('audio'), meetingController.manualUpload);

// // Processing status
// router.get('/:id/processing-status', meetingController.getProcessingStatus);

// // RAG Q&A
// router.post('/:id/qa', meetingController.meetingQA);

// // Similar meetings
// router.get('/:id/similar', meetingController.getSimilarMeetings);

// // Schedule follow-up
// router.post('/:id/schedule-followup', meetingController.scheduleFollowup);

// // Export to PDF
// router.get('/:id/export', meetingController.exportToPDF);

// // ✅ Save manual speaker corrections on transcript
// router.put('/:id/transcript-segments', meetingController.updateTranscriptSegments);

// module.exports = router;
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { meetingController } = require('../controllers');
const { authMiddleware } = require('../middleware');

const storage = multer.memoryStorage();

// ── Unified file filter ────────────────────────────────────────────────────
// Covers every MIME type a browser can produce for audio:
// - audio/webm        → Chrome/Firefox MediaRecorder output
// - audio/ogg         → Firefox fallback
// - audio/mpeg        → MP3 uploads
// - audio/wav / wave  → WAV uploads
// - audio/mp4         → M4A on Safari (reports as mp4)
// - audio/x-m4a       → M4A explicit type
// - audio/aac         → AAC uploads
// The controller's own duplicate MIME check has been removed (see controller fix)
// so this single filter is the sole gatekeeper.
const allowedMimeTypes = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
]);

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: MP3, WAV, M4A, WebM, OGG, AAC`));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter,
});

router.use(authMiddleware);

// ── Meeting CRUD ───────────────────────────────────────────────────────────
router.get('/', meetingController.getMeetings);
router.post('/', meetingController.createMeeting);

// ── STATIC ROUTES MUST COME BEFORE /:id ───────────────────────────────────
// FIX 1: /upload was registered AFTER /:id so Express matched "upload" as
// an ID value and routed the request to uploadRecording instead of
// manualUpload. Moving all static-segment routes above /:id fixes this.
//
// FIX 2: Both the room recording and manual upload now use the SAME multer
// field name 'recording'. Previously manualUpload used upload.single('audio')
// which didn't match what AudioUploadForm actually sent ('recording'), so
// req.file was always undefined and the controller returned 400/500.
router.post('/upload', upload.single('recording'), meetingController.manualUpload);

// ── Dynamic :id routes ─────────────────────────────────────────────────────
router.get('/:id', meetingController.getMeeting);
router.put('/:id', meetingController.updateMeeting);
router.delete('/:id', meetingController.deleteMeeting);
router.post('/:id/cancel', meetingController.cancelMeeting);

// Room lifecycle
router.post('/:id/join', meetingController.joinMeeting);
router.post('/:id/leave', meetingController.leaveMeeting);
router.post('/:id/end', meetingController.endMeeting);

// Room recording upload — field name 'recording' (unchanged)
router.post('/:id/upload-recording', upload.single('recording'), meetingController.uploadRecording);

// Processing status
router.get('/:id/processing-status', meetingController.getProcessingStatus);

// AI features
router.post('/:id/qa', meetingController.meetingQA);
router.get('/:id/similar', meetingController.getSimilarMeetings);

// Follow-up
router.post('/:id/schedule-followup', meetingController.scheduleFollowup);

// Export
router.get('/:id/export', meetingController.exportToPDF);

// Transcript corrections
router.put('/:id/transcript-segments', meetingController.updateTranscriptSegments);

module.exports = router;