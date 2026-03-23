/**
 * TEMPORARY SCRIPT — Run once to requeue a stuck meeting
 * Usage: node requeue-meeting.js <meetingId>
 *
 * The meeting's audio is already in S3 — this just adds the job
 * back to BullMQ so the worker picks it up and generates transcript/summary.
 */

require('dotenv').config();

const { Queue } = require('bullmq');
const mongoose = require('mongoose');

const MEETING_ID = process.argv[2] || '69c10daa24c0ec8f7514ab5e';

async function requeue() {
  if (!MEETING_ID) {
    console.error('Usage: node requeue-meeting.js <meetingId>');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI);

  const Meeting = require('./models/Meeting');
  const meeting = await Meeting.findById(MEETING_ID);

  if (!meeting) {
    console.error(`Meeting ${MEETING_ID} not found`);
    process.exit(1);
  }

  console.log(`Found meeting: "${meeting.name}" (status: ${meeting.status})`);

  if (!meeting.recordingUrl && (!meeting.perDeviceAudioKeys || meeting.perDeviceAudioKeys.length === 0)) {
    console.error('Meeting has no recordingUrl and no per-device audio keys in DB.');
    console.log('Current meeting data:', JSON.stringify({
      recordingUrl: meeting.recordingUrl,
      status: meeting.status,
      recordingSource: meeting.recordingSource
    }, null, 2));
    process.exit(1);
  }

  // Reset meeting status to processing
  meeting.status = 'processing';
  meeting.processingError = null;
  meeting.processingSteps = [
    { step: 'upload', status: 'done', timestamp: new Date() },
    { step: 'transcription', status: 'pending' },
    { step: 'diarization', status: 'pending' },
    { step: 'analysis', status: 'pending' },
    { step: 'embedding', status: 'pending' },
    { step: 'ready', status: 'pending' }
  ];
  await meeting.save();
  console.log('Meeting status reset to processing ✅');

  // Connect to BullMQ
  const meetingQueue = new Queue('meeting-processing', {
    connection: { url: process.env.REDIS_URL }
  });

  // Build job data — include per-device audio keys if stored in DB
  const jobData = {
    meetingId: MEETING_ID,
    audioKey: meeting.recordingUrl || null,
  };

  // If per-device audio keys were saved to the meeting document, include them
  if (meeting.perDeviceAudioKeys && meeting.perDeviceAudioKeys.length > 0) {
    jobData.perDeviceAudio = meeting.perDeviceAudioKeys;
    console.log(`Including per-device audio for ${meeting.perDeviceAudioKeys.length} participants`);
  }

  const job = await meetingQueue.add('process-meeting', jobData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  });

  console.log(`Job ${job.id} added to queue ✅`);
  console.log(`Meeting ${MEETING_ID} will be processed shortly.`);
  console.log(`Check the worker logs (angelic-manifestation) to see progress.`);

  await meetingQueue.close();
  await mongoose.disconnect();
  process.exit(0);
}

requeue().catch(err => {
  console.error('Requeue failed:', err.message);
  process.exit(1);
});