/**
 * Requeue any meeting for reprocessing — no logs needed.
 * Usage: node requeue-meeting.js <meetingId>
 *
 * Works in 3 ways (tries each in order):
 * 1. Uses perDeviceAudioKeys saved on the meeting document (per-device pipeline)
 * 2. Uses recordingUrl saved on the meeting document (mixed audio pipeline)
 * 3. Scans S3 for audio files for this meeting (fallback)
 */

require('dotenv').config();

const { Queue } = require('bullmq');
const mongoose = require('mongoose');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const MEETING_ID = process.argv[2];

if (!MEETING_ID) {
  console.error('Usage: node requeue-meeting.js <meetingId>');
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function scanS3ForAudio(meetingId) {
  try {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET,
      Prefix: `meetings/${meetingId}/`,
    }));

    const files = (result.Contents || []).map(f => f.Key);
    console.log(`Found ${files.length} files in S3 for this meeting:`);
    files.forEach(f => console.log(' ', f));

    const deviceFiles = files.filter(f => f.includes('/device-'));
    const recordingFile = files.find(f => f.includes('/recording-'));

    return { deviceFiles, recordingFile };
  } catch (e) {
    console.warn(`S3 scan failed: ${e.message}`);
    return { deviceFiles: [], recordingFile: null };
  }
}

async function run() {
  console.log(`\nConnecting to MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI);

  const Meeting = require('./models/Meeting');

  const meeting = await Meeting.findById(MEETING_ID)
    .populate('attendees.user', 'firstName lastName');

  if (!meeting) {
    console.error(`Meeting ${MEETING_ID} not found in database`);
    process.exit(1);
  }

  console.log(`\nFound meeting: "${meeting.name}"`);
  console.log(`Status: ${meeting.status}`);
  console.log(`Attendees: ${meeting.attendees.map(a => `${a.user?.firstName} ${a.user?.lastName}`).join(', ')}`);

  let jobData = null;

  // ── Method 1: perDeviceAudioKeys on meeting document ─────────────────────
  if (meeting.perDeviceAudioKeys && meeting.perDeviceAudioKeys.length > 0) {
    console.log(`\n✅ Method 1: Using perDeviceAudioKeys from meeting document`);
    meeting.perDeviceAudioKeys.forEach(k => console.log(`  ${k.userName}: ${k.audioKey}`));
    jobData = {
      meetingId: MEETING_ID,
      perDeviceAudio: meeting.perDeviceAudioKeys,
    };
  }

  // ── Method 2: recordingUrl on meeting document ────────────────────────────
  if (!jobData && meeting.recordingUrl) {
    console.log(`\n✅ Method 2: Using recordingUrl from meeting document`);
    console.log(`  Recording: ${meeting.recordingUrl}`);
    jobData = {
      meetingId: MEETING_ID,
      audioKey: meeting.recordingUrl,
    };
  }

  // ── Method 3: Scan S3 ─────────────────────────────────────────────────────
  if (!jobData) {
    console.log(`\n⚠️  No audio keys in DB — scanning S3...`);
    const { deviceFiles, recordingFile } = await scanS3ForAudio(MEETING_ID);

    if (deviceFiles.length > 0) {
      console.log(`✅ Method 3a: Found ${deviceFiles.length} per-device files in S3`);

      const perDeviceAudio = deviceFiles.map(key => {
        const match = key.match(/device-([a-f0-9]+)-/);
        const userId = match?.[1];
        const attendee = meeting.attendees.find(a => a.user?._id?.toString() === userId);
        const userName = attendee
          ? `${attendee.user.firstName} ${attendee.user.lastName}`
          : 'Unknown Speaker';
        return { userId, userName, audioKey: key };
      });

      perDeviceAudio.forEach(p => console.log(`  ${p.userName}: ${p.audioKey}`));
      jobData = { meetingId: MEETING_ID, perDeviceAudio };

    } else if (recordingFile) {
      console.log(`✅ Method 3b: Found mixed recording in S3`);
      console.log(`  Recording: ${recordingFile}`);
      jobData = { meetingId: MEETING_ID, audioKey: recordingFile };

    } else {
      console.error(`❌ No audio files found in S3 for meeting ${MEETING_ID}`);
      process.exit(1);
    }
  }

  // ── Reset meeting ─────────────────────────────────────────────────────────
  meeting.status = 'processing';
  meeting.processingError = null;
  meeting.summary = null;
  meeting.transcriptRaw = null;
  meeting.transcriptSegments = [];
  meeting.conclusions = [];
  meeting.decisions = [];
  meeting.actionItems = [];
  meeting.followUpTopics = [];
  meeting.attendeeContributions = [];
  meeting.processingSteps = [
    { step: 'upload',        status: 'done',    timestamp: new Date() },
    { step: 'transcription', status: 'pending' },
    { step: 'diarization',   status: 'pending' },
    { step: 'analysis',      status: 'pending' },
    { step: 'embedding',     status: 'pending' },
    { step: 'ready',         status: 'pending' },
  ];
  await meeting.save();
  console.log(`\n✅ Meeting reset to processing`);

  // ── Queue job ─────────────────────────────────────────────────────────────
  const { getRedisConnection } = require('./config/redisConnection');

  const q = new Queue('meeting-processing', {
    connection: getRedisConnection()
  });

  const job = await q.add('process-meeting', jobData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  });

  console.log(`✅ Job ${job.id} queued`);
  console.log(`\nWatch Railway worker logs for progress.`);
  console.log(`Meeting URL: https://team-catalyst-v2-0.vercel.app/meetings/${MEETING_ID}\n`);

  await q.close();
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => {
  console.error('Failed:', e.message);
  process.exit(1);
});