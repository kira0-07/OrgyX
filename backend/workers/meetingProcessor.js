// const { Worker } = require('bullmq');
// const fs = require('fs');
// const path = require('path');
// const ffmpeg = require('fluent-ffmpeg');
// const { promisify } = require('util');
// const Groq = require('groq-sdk');
// const FormData = require('form-data');
// const fetch = require('node-fetch');
// const { Meeting, PromptTemplate, Performance, Notification } = require('../models');
// const { chromaClient } = require('../config/chroma');
// const { generateEmbedding } = require('../ai/embeddings');
// const { meetingAnalysisChain, chunkTranscript, scoreAttendeeChain } = require('../ai/langchain');
// const { getFileUrl, uploadFile } = require('../config/s3');
// const winston = require('winston');

// const execAsync = promisify(require('child_process').exec);

// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
//   transports: [new winston.transports.Console()]
// });

// const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// const DIARIZATION_URL = process.env.DIARIZATION_URL || 'http://diarization:8001';

// // ─────────────────────────────────────────────────────────────────────────────
// // FIX 1: Hallucination filter
// // Whisper hallucinates these phrases on silent or very short audio segments.
// // We match the ENTIRE trimmed segment text — partial matches are NOT filtered
// // so real sentences that happen to contain "thank you" are preserved.
// // ─────────────────────────────────────────────────────────────────────────────
// const HALLUCINATION_PHRASES = new Set([
//   'thank you',
//   'thank you very much',
//   'thanks for watching',
//   'thanks for listening',
//   'please subscribe',
//   'see you next time',
//   'bye bye',
//   'goodbye',
//   'you',
//   'thanks',
//   'thank you for watching',
//   'thank you for listening',
//   'subtitles by',
//   'subscribe to',
//   'like and subscribe',
//   "i'll see you in the next one",
//   "don't forget to subscribe",
// ]);

// function filterHallucination(text) {
//   if (!text || !text.trim()) return '';
//   // Strip trailing punctuation before matching
//   const trimmed = text.trim().toLowerCase().replace(/[.,!?]+$/, '');
//   if (HALLUCINATION_PHRASES.has(trimmed)) {
//     logger.warn(`Hallucination filtered: "${text.trim()}"`);
//     return '';
//   }
//   return text.trim();
// }

// // ─────────────────────────────────────────────────────────────────────────────

// async function updateStep(meetingId, step, status, message = null, io = null) {
//   const meeting = await Meeting.findById(meetingId);
//   if (meeting) {
//     const stepObj = meeting.processingSteps.find(s => s.step === step);
//     if (stepObj) {
//       stepObj.status = status;
//       stepObj.timestamp = new Date();
//       if (message) stepObj.message = message;
//     }
//     await meeting.save();
//     if (io) io.to(meetingId).emit('processing-update', { step, status, message });
//   }
// }

// async function downloadAudio(audioKey) {
//   const url = await getFileUrl(audioKey, 3600);
//   const tempDir = '/temp';
//   if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
//   const localPath = path.join(tempDir, `${Date.now()}-${path.basename(audioKey)}`);
//   const response = await fetch(url);
//   const buffer = await response.arrayBuffer();
//   fs.writeFileSync(localPath, Buffer.from(buffer));
//   return localPath;
// }

// function getAudioDuration(filePath) {
//   return new Promise((resolve) => {
//     ffmpeg.ffprobe(filePath, (err, metadata) => {
//       if (err) { logger.warn(`ffprobe error: ${err.message}`); return resolve(0); }
//       const duration = metadata?.format?.duration;
//       resolve(typeof duration === 'number' && !isNaN(duration) ? duration : 0);
//     });
//   });
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // FIX 2: Overlap chunking — prevents word cutoff at chunk boundaries
// // Each chunk is 590s content + 10s overlap with the next chunk.
// // Advance by 590s only so the overlap region is re-transcribed in the next chunk.
// // ─────────────────────────────────────────────────────────────────────────────
// async function splitAudioWithOverlap(filePath, chunkDuration = 590, overlap = 10) {
//   const outputDir = '/temp/chunks';
//   if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

//   const totalDuration = await getAudioDuration(filePath);
//   const baseName = path.basename(filePath, path.extname(filePath));
//   const chunkPaths = [];

//   let start = 0;
//   let index = 0;

//   while (start < totalDuration) {
//     const outputPath = path.join(
//       outputDir,
//       `${baseName}_chunk_${String(index).padStart(3, '0')}.wav`
//     );
//     const segmentLength = Math.min(chunkDuration + overlap, totalDuration - start);

//     await new Promise((resolve, reject) => {
//       ffmpeg(filePath)
//         .seekInput(start)
//         .duration(segmentLength)
//         .output(outputPath)
//         .audioCodec('pcm_s16le')
//         .audioFrequency(16000)
//         .audioChannels(1)
//         .on('end', resolve)
//         .on('error', reject)
//         .run();
//     });

//     chunkPaths.push({ path: outputPath, startTime: start });
//     start += chunkDuration;
//     index++;
//   }

//   logger.info(`Split into ${chunkPaths.length} overlapping chunks`);
//   return chunkPaths;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // FIX 3: temperature: 0 makes Whisper output deterministic → fewer hallucinations
// // FIX 4: Every segment text is passed through filterHallucination() so
// //         junk phrases never enter the transcript at all
// // ─────────────────────────────────────────────────────────────────────────────
// async function transcribeWithGroq(audioPath) {
//   try {
//     logger.info(`Transcribing: ${audioPath}`);
//     const audioStream = fs.createReadStream(audioPath);
//     const transcription = await groq.audio.transcriptions.create({
//       file: audioStream,
//       model: 'whisper-large-v3',
//       response_format: 'verbose_json',
//       language: 'en',
//       temperature: 0,   // ✅ FIX: deterministic = fewer hallucinations
//     });

//     // ✅ FIX: Filter each segment individually
//     if (transcription.segments) {
//       transcription.segments = transcription.segments
//         .map(seg => ({ ...seg, text: filterHallucination(seg.text) }))
//         .filter(seg => seg.text.length > 0);
//     }

//     // Rebuild top-level text from filtered segments
//     if (transcription.text) {
//       transcription.text = transcription.segments && transcription.segments.length > 0
//         ? transcription.segments.map(s => s.text).join(' ')
//         : filterHallucination(transcription.text);
//     }

//     return transcription;
//   } catch (error) {
//     logger.error(`Groq transcription error: ${error.message}`);
//     throw error;
//   }
// }

// async function diarizeWithPyannote(audioPath, numSpeakers) {
//   try {
//     const healthRes = await fetch(`${DIARIZATION_URL}/health`, { timeout: 5000 });
//     const health = await healthRes.json();
//     if (!health.pipeline_loaded) {
//       logger.warn('Pyannote pipeline not loaded — falling back to LLM diarization');
//       return null;
//     }

//     logger.info(`Sending audio to pyannote diarization service (num_speakers=${numSpeakers})`);

//     const form = new FormData();
//     form.append('file', fs.createReadStream(audioPath), {
//       filename: path.basename(audioPath),
//       contentType: 'audio/wav'
//     });

//     const url = numSpeakers > 1
//       ? `${DIARIZATION_URL}/diarize?num_speakers=${numSpeakers}`
//       : `${DIARIZATION_URL}/diarize`;

//     const response = await fetch(url, {
//       method: 'POST',
//       body: form,
//       headers: form.getHeaders(),
//       timeout: 300000
//     });

//     if (!response.ok) {
//       const err = await response.text();
//       logger.warn(`Pyannote diarization failed: ${err} — falling back to LLM`);
//       return null;
//     }

//     const result = await response.json();
//     logger.info(`Pyannote complete: ${result.segments.length} segments, ${result.num_speakers_detected} speakers`);
//     return result.segments;

//   } catch (error) {
//     logger.warn(`Pyannote service unreachable: ${error.message} — falling back to LLM diarization`);
//     return null;
//   }
// }

// function mergeTranscriptWithDiarization(groqSegments, diarSegments, attendeeNames) {
//   const speakingTime = {};
//   for (const seg of diarSegments) {
//     const duration = (seg.end || 0) - (seg.start || 0);
//     speakingTime[seg.speaker] = (speakingTime[seg.speaker] || 0) + duration;
//   }

//   const sortedSpeakers = Object.keys(speakingTime).sort(
//     (a, b) => speakingTime[b] - speakingTime[a]
//   );

//   const speakerMap = {};
//   sortedSpeakers.forEach((speaker, idx) => {
//     speakerMap[speaker] = attendeeNames[idx % attendeeNames.length];
//   });

//   logger.info(`Speaker mapping: ${JSON.stringify(speakerMap)}`);

//   return groqSegments.map(seg => {
//     const midpoint = ((seg.start || 0) + (seg.end || 0)) / 2;
//     const diarSeg = diarSegments.find(d => d.start <= midpoint && midpoint <= d.end);
//     const closestSeg = diarSeg || diarSegments.reduce((closest, d) => {
//       if (!closest) return d;
//       return Math.abs(d.start - midpoint) < Math.abs(closest.start - midpoint) ? d : closest;
//     }, null);

//     const speaker = closestSeg
//       ? (speakerMap[closestSeg.speaker] || attendeeNames[0])
//       : attendeeNames[0];

//     return { ...seg, speaker };
//   });
// }

// function mergeShortSegments(segments, minDuration = 1.0) {
//   if (!segments || segments.length === 0) return [];
//   const merged = [];
//   let current = { ...segments[0] };

//   for (let i = 1; i < segments.length; i++) {
//     const seg = segments[i];
//     const duration = (current.end || 0) - (current.start || 0);
//     const endsWithPunctuation = /[.!?]$/.test(current.text?.trim() || '');

//     if (duration < minDuration || !endsWithPunctuation) {
//       current = {
//         ...current,
//         end: seg.end,
//         text: (current.text || '').trim() + ' ' + (seg.text || '').trim()
//       };
//     } else {
//       merged.push(current);
//       current = { ...seg };
//     }
//   }
//   merged.push(current);
//   return merged;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // FIX 5: Transcript ordering — LLM now receives the meeting host's name
// // so it knows who most likely opened the meeting and spoke first.
// // Without this, the LLM randomly assigns P2 to segment [0], making P2's
// // transcript appear before P1 even though P1 started the meeting.
// // ─────────────────────────────────────────────────────────────────────────────
// async function inferSpeakersWithLLM(segments, attendeeNames, hostName = null) {
//   if (!segments || segments.length === 0) return [];

//   if (attendeeNames.length === 1) {
//     return segments.map(seg => ({ ...seg, speaker: attendeeNames[0] }));
//   }

//   const batchSize = 30;
//   const allLabeled = [];

//   for (let batchStart = 0; batchStart < segments.length; batchStart += batchSize) {
//     const batch = segments.slice(batchStart, batchStart + batchSize);
//     const isFirstBatch = batchStart === 0;

//     const segmentList = batch.map((seg, localIdx) =>
//       `[${localIdx}] ${seg.text?.trim()}`
//     ).join('\n');

//     // ✅ FIX: Provide host context so segment [0] is assigned correctly
//     const hostLine = hostName
//       ? `\nIMPORTANT: "${hostName}" is the meeting host. They almost certainly spoke first (segment [0]). Assign them to early segments unless the text clearly shows otherwise.\n`
//       : '';

//     const firstBatchNote = isFirstBatch
//       ? '\nNOTE: This is the very start of the meeting. The host typically opens with greetings or agenda.\n'
//       : '';

//     const prompt = `You are analyzing a meeting transcript. The meeting has exactly these attendees (use ONLY these exact names):
// ${attendeeNames.map((n, i) => `- Speaker ${i + 1}: ${n}`).join('\n')}
// ${hostLine}${firstBatchNote}
// Rules:
// 1. Use ONLY the exact names listed above — no titles, no roles
// 2. Assign each segment to one speaker based on conversation flow and context
// 3. Look for: questions followed by answers, topic handoffs, first-person references
// 4. A speaker can have multiple consecutive segments
// 5. The host typically opens and closes the meeting

// Segments to label:
// ${segmentList}

// Return ONLY a valid JSON array (no markdown, no explanation):
// [{"index":0,"speaker":"${attendeeNames[0]}"},{"index":1,"speaker":"${attendeeNames[Math.min(1, attendeeNames.length - 1)]}"}]`;

//     try {
//       const response = await groq.chat.completions.create({
//         model: 'llama-3.3-70b-versatile',
//         messages: [{ role: 'user', content: prompt }],
//         temperature: 0.1,
//         max_tokens: 4096
//       });

//       const content = response.choices[0]?.message?.content || '[]';
//       const clean = content.replace(/```json|```/g, '').trim();
//       let assignments = [];
//       try {
//         assignments = JSON.parse(clean);
//       } catch (parseErr) {
//         const match = clean.match(/\[[\s\S]*\]/);
//         if (match) assignments = JSON.parse(match[0]);
//       }

//       batch.forEach((seg, localIdx) => {
//         const assignment = assignments.find(a => a.index === localIdx);
//         const assignedName = assignment?.speaker?.trim();
//         const validName = attendeeNames.includes(assignedName)
//           ? assignedName
//           : attendeeNames[localIdx % attendeeNames.length];
//         allLabeled.push({ ...seg, speaker: validName });
//       });

//     } catch (error) {
//       logger.warn(`LLM speaker inference failed for batch at ${batchStart}: ${error.message}`);
//       batch.forEach((seg, localIdx) => {
//         allLabeled.push({
//           ...seg,
//           speaker: attendeeNames[(batchStart + localIdx) % attendeeNames.length]
//         });
//       });
//     }
//   }

//   return allLabeled;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Per-device transcription pipeline
// // Each participant's audio is transcribed separately — speaker attribution
// // is 100% accurate since we already know who each audio file belongs to.
// // FIX 6: Hallucination filter is applied inside transcribeWithGroq(),
// //         so segments that come out are already clean.
// // ─────────────────────────────────────────────────────────────────────────────
// async function processPerDeviceAudio(perDeviceAudio, meetingId) {
//   logger.info(`Processing per-device audio for ${perDeviceAudio.length} participants`);

//   const tempDir = '/temp';
//   if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

//   const allSegments = [];

//   for (const device of perDeviceAudio) {
//     const { userId, userName, audioKey } = device;
//     logger.info(`Transcribing audio for ${userName} (${userId})`);

//     let localPath = null;
//     try {
//       localPath = await downloadAudio(audioKey);

//       const stat = fs.statSync(localPath);
//       if (stat.size < 1000) {
//         logger.warn(`Audio for ${userName} too small (${stat.size} bytes) — skipping`);
//         continue;
//       }

//       // ✅ transcribeWithGroq already applies filterHallucination to each segment
//       const result = await transcribeWithGroq(localPath);
//       const segments = result?.segments || [];

//       logger.info(`${userName}: ${segments.length} segments transcribed`);

//       for (const seg of segments) {
//         const text = seg.text?.trim();
//         if (!text || text.length < 2) continue;

//         allSegments.push({
//           speaker: userName,
//           text,
//           startTime: seg.start || 0,
//           endTime: seg.end || 0,
//           start: seg.start || 0,
//           end: seg.end || 0,
//           userId,
//           source: 'per-device'
//         });
//       }

//     } catch (e) {
//       logger.warn(`Failed to process audio for ${userName}: ${e.message}`);
//     } finally {
//       if (localPath) {
//         try { fs.unlinkSync(localPath); } catch (e) {}
//       }
//     }
//   }

//   if (allSegments.length === 0) {
//     logger.warn('No segments from per-device audio — will fall back to mixed audio');
//     return null;
//   }

//   // ✅ Sort chronologically before dedup
//   allSegments.sort((a, b) => a.startTime - b.startTime);

//   // Deduplication — remove hallucinated repeats within 15s with 80% text similarity
//   const dedupedSegments = [];
//   for (const seg of allSegments) {
//     const isDuplicate = dedupedSegments.some(existing => {
//       const a = existing.text.trim().toLowerCase();
//       const b = seg.text.trim().toLowerCase();
//       const timeDiff = Math.abs(seg.startTime - existing.startTime);
//       const longer = Math.max(a.length, b.length);
//       const shorter = Math.min(a.length, b.length);
//       return timeDiff < 15 && longer > 0 && shorter / longer > 0.8;
//     });
//     if (!isDuplicate) dedupedSegments.push(seg);
//   }

//   logger.info(`Per-device pipeline: ${dedupedSegments.length} segments from ${perDeviceAudio.length} participants`);
//   return dedupedSegments;
// }

// function formatTime(seconds) {
//   const mins = Math.floor(seconds / 60);
//   const secs = Math.floor(seconds % 60);
//   return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
// }

// async function processMeeting(job) {
//   const { meetingId, audioKey, perDeviceAudio } = job.data;
//   const io = global.io;
//   logger.info(`Starting processing for meeting ${meetingId}`);
//   logger.info(`Per-device audio available: ${perDeviceAudio?.length || 0} participants`);

//   try {
//     const meeting = await Meeting.findById(meetingId)
//       .populate('attendees.user', 'firstName lastName');

//     if (!meeting) throw new Error('Meeting not found');

//     // ✅ FIX: Resolve host name so LLM diarization knows who opened the meeting
//     const hostAttendee = meeting.attendees.find(
//       a => a.user?._id?.toString() === meeting.host?.toString()
//     );
//     const hostName = hostAttendee?.user
//       ? `${hostAttendee.user.firstName} ${hostAttendee.user.lastName}`.trim()
//       : null;

//     logger.info(`Meeting host: ${hostName || 'unknown'}`);

//     await updateStep(meetingId, 'upload', 'done', 'Audio received', io);
//     await updateStep(meetingId, 'transcription', 'running', 'Starting transcription', io);

//     let transcriptSegments = null;
//     let transcript = '';
//     let usedPerDevice = false;

//     // ── PATH 1: Per-device audio (preferred) ─────────────────────────────────
//     if (perDeviceAudio && perDeviceAudio.length > 0) {
//       logger.info('Using per-device audio pipeline — no diarization needed');
//       try {
//         transcriptSegments = await processPerDeviceAudio(perDeviceAudio, meetingId);
//         if (transcriptSegments && transcriptSegments.length > 0) {
//           transcript = transcriptSegments.map(s => `${s.speaker}: ${s.text}`).join('\n');
//           usedPerDevice = true;
//           meeting.speakerDiarizationMethod = 'per-device';
//           logger.info(`Per-device transcription success: ${transcriptSegments.length} segments`);
//         } else {
//           logger.warn('Per-device pipeline returned no segments — falling back to mixed audio');
//         }
//       } catch (e) {
//         logger.warn(`Per-device pipeline failed: ${e.message} — falling back to mixed audio`);
//       }
//     }

//     // ── PATH 2: Mixed audio fallback ─────────────────────────────────────────
//     if (!usedPerDevice && audioKey) {
//       logger.info('Using mixed audio pipeline with diarization');

//       const localAudioPath = await downloadAudio(audioKey);
//       const rawDuration = await getAudioDuration(localAudioPath);
//       meeting.actualDuration = (rawDuration && !isNaN(rawDuration)) ? Math.round(rawDuration / 60) : 0;
//       logger.info(`Audio duration: ${rawDuration}s`);

//       let groqResult = null;
//       const fileSizeMB = fs.statSync(localAudioPath).size / (1024 * 1024);

//       if (fileSizeMB > 24 || rawDuration > 590) {
//         // ✅ FIX: Overlap chunking replaces hard-cut splitAudio
//         logger.info('Large file — splitting into overlapping chunks');
//         const chunks = await splitAudioWithOverlap(localAudioPath);
//         const allSegments = [];

//         for (const chunk of chunks) {
//           const chunkResult = await transcribeWithGroq(chunk.path); // ✅ already filtered
//           transcript += (chunkResult?.text || '') + '\n';
//           if (chunkResult?.segments) {
//             chunkResult.segments.forEach(seg => {
//               allSegments.push({
//                 ...seg,
//                 start: (seg.start || 0) + chunk.startTime,
//                 end: (seg.end || 0) + chunk.startTime
//               });
//             });
//           }
//           try { fs.unlinkSync(chunk.path); } catch (e) {}
//         }
//         groqResult = { text: transcript, segments: allSegments };
//       } else {
//         groqResult = await transcribeWithGroq(localAudioPath); // ✅ already filtered
//         transcript = groqResult?.text || '';
//       }

//       meeting.transcriptRaw = transcript;
//       logger.info(`Transcription done. Text: ${transcript.length} chars, segments: ${groqResult?.segments?.length || 0}`);
//       await updateStep(meetingId, 'transcription', 'done', 'Transcription complete', io);

//       await updateStep(meetingId, 'diarization', 'running', 'Identifying speakers', io);

//       const joinedAttendees = meeting.attendees.filter(
//         a => a.attended === true || a.joinedAt !== null
//       );
//       const activeAttendees = joinedAttendees.length > 0 ? joinedAttendees : meeting.attendees;
//       const attendeeNames = activeAttendees
//         .map(a => `${(a.user?.firstName || '').trim()} ${(a.user?.lastName || '').trim()}`.trim())
//         .filter(name => name.length > 0);

//       logger.info(`Attendees for diarization: ${attendeeNames.join(', ')}`);

//       const rawSegments = (groqResult?.segments || []).map(seg => ({
//         text: seg.text?.trim() || '',
//         startTime: seg.start || 0,
//         endTime: seg.end || 0,
//         start: seg.start || 0,
//         end: seg.end || 0
//       })).filter(seg => seg.text.length > 0);

//       const numSpeakers = attendeeNames.length;
//       const diarSegments = await diarizeWithPyannote(localAudioPath, numSpeakers);

//       let labeledSegments;
//       if (diarSegments && diarSegments.length > 0) {
//         logger.info(`Using pyannote diarization (${diarSegments.length} segments)`);
//         labeledSegments = mergeTranscriptWithDiarization(rawSegments, diarSegments, attendeeNames);
//         meeting.speakerDiarizationMethod = 'pyannote';
//       } else {
//         logger.info('Pyannote unavailable — using LLM speaker inference fallback');
//         const segmentsToLabel = rawDuration < 600 ? rawSegments : mergeShortSegments(rawSegments);
//         // ✅ FIX: Pass hostName to anchor first-speaker assignment
//         labeledSegments = await inferSpeakersWithLLM(segmentsToLabel, attendeeNames, hostName);
//         meeting.speakerDiarizationMethod = 'llm';
//       }

//       const rawMappedSegments = labeledSegments.map(seg => ({
//         speaker: seg.speaker || 'Unknown Speaker',
//         startTime: seg.startTime || seg.start || 0,
//         endTime: seg.endTime || seg.end || 0,
//         text: seg.text || ''
//       }));

//       // Dedup
//       const dedupedSegments = [];
//       for (const seg of rawMappedSegments) {
//         const isDuplicate = dedupedSegments.some(existing => {
//           const a = existing.text.trim().toLowerCase();
//           const b = seg.text.trim().toLowerCase();
//           const timeDiff = Math.abs(seg.startTime - existing.startTime);
//           const longer = Math.max(a.length, b.length);
//           const shorter = Math.min(a.length, b.length);
//           return timeDiff < 15 && longer > 0 && shorter / longer > 0.8;
//         });
//         if (!isDuplicate) dedupedSegments.push(seg);
//       }

//       transcriptSegments = dedupedSegments;
//       try { fs.unlinkSync(localAudioPath); } catch (e) {}
//     }

//     // ✅ FIX: Always sort by startTime before saving
//     // Guarantees correct chronological order on the frontend regardless of
//     // which diarization method was used or how the LLM assigned speakers.
//     if (transcriptSegments && transcriptSegments.length > 0) {
//       transcriptSegments.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
//     }

//     meeting.transcriptRaw = transcript || transcriptSegments?.map(s => `${s.speaker}: ${s.text}`).join('\n') || '';
//     meeting.transcriptSegments = transcriptSegments || [];
//     meeting.speakerDiarizationEditable = true;

//     if (usedPerDevice) {
//       await updateStep(meetingId, 'transcription', 'done', `Transcribed ${perDeviceAudio.length} participants`, io);
//       await updateStep(meetingId, 'diarization', 'done', 'Speaker attribution via per-device audio — 100% accurate', io);
//     } else {
//       await updateStep(meetingId, 'diarization', 'done', 'Speaker identification complete', io);
//     }

//     logger.info(`Final segments: ${meeting.transcriptSegments.length}, method: ${meeting.speakerDiarizationMethod}`);

//     // Step 4: Analysis
//     await updateStep(meetingId, 'analysis', 'running', 'Analyzing meeting content', io);

//     const promptTemplate = await PromptTemplate.findOne({ domain: meeting.domain, isActive: true });

//     const analysis = await meetingAnalysisChain(
//       meeting.transcriptRaw,
//       meeting.domain,
//       meeting.attendees.map(a => a.user),
//       promptTemplate || {
//         systemPrompt: 'You are a meeting analyst. Analyze the meeting transcript and return structured insights.',
//         userPromptTemplate: 'Analyze this {domain} meeting transcript:\n\n{transcript}\n\nAttendees: {attendees}\n\nReturn JSON with: summary, conclusions, decisions, actionItems (array with owner/task/deadline fields), followUpTopics, attendeeContributions (array with name/score/keyPoints fields)'
//       },
//       meeting.transcriptSegments
//     );

//     meeting.summary = analysis.summary;
//     meeting.conclusions = analysis.conclusions || [];
//     meeting.decisions = analysis.decisions || [];
//     meeting.actionItems = (analysis.actionItems || []).map(item => {
//       let deadline = null;
//       if (item.deadline) {
//         const parsed = new Date(item.deadline);
//         deadline = isNaN(parsed.getTime()) ? null : parsed;
//       }
//       return {
//         owner: meeting.attendees.find(a => {
//           const name = `${a.user?.firstName} ${a.user?.lastName}`.toLowerCase();
//           return name.includes((item.owner || '').toLowerCase());
//         })?.user?._id || meeting.host,
//         task: item.task,
//         deadline,
//         status: 'pending'
//       };
//     });
//     meeting.followUpTopics = analysis.followUpTopics || [];

//     meeting.attendeeContributions = [];

//     for (const attendee of meeting.attendees) {
//       const name = `${attendee.user?.firstName} ${attendee.user?.lastName}`.trim();
//       try {
//         const contribution = await scoreAttendeeChain(
//           name,
//           meeting.transcriptRaw,
//           meeting.domain,
//           meeting.transcriptSegments
//         );
//         const score = (contribution.score && !isNaN(contribution.score)) ? contribution.score : 5;
//         attendee.contributionScore = score;
//         attendee.keyPoints = contribution.keyPoints || [];

//         meeting.attendeeContributions.push({
//           user: attendee.user._id,
//           name,
//           score,
//           keyPoints: contribution.keyPoints || [],
//           speakingTime: 0
//         });
//       } catch (e) {
//         logger.warn(`Score failed for ${name}: ${e.message}`);
//         meeting.attendeeContributions.push({
//           user: attendee.user._id,
//           name,
//           score: 5,
//           keyPoints: [],
//           speakingTime: 0
//         });
//       }
//     }

//     await updateStep(meetingId, 'analysis', 'done', 'Analysis complete', io);

//     // Step 5: Embeddings
//     await updateStep(meetingId, 'embedding', 'running', 'Storing embeddings', io);
//     try {
//       const speakerChunks = [];
//       let currentChunk = '';
//       let currentWordCount = 0;
//       const CHUNK_WORD_LIMIT = 300;

//       for (const seg of meeting.transcriptSegments) {
//         const line = `${seg.speaker}: ${seg.text}`;
//         const wordCount = line.split(' ').length;
//         if (currentWordCount + wordCount > CHUNK_WORD_LIMIT && currentChunk.length > 0) {
//           speakerChunks.push(currentChunk.trim());
//           currentChunk = '';
//           currentWordCount = 0;
//         }
//         currentChunk += line + '\n';
//         currentWordCount += wordCount;
//       }
//       if (currentChunk.trim().length > 0) speakerChunks.push(currentChunk.trim());

//       const chunks = speakerChunks.length > 0 ? speakerChunks : chunkTranscript(meeting.transcriptRaw, 300);
//       const attendeeNames = meeting.attendees.map(a =>
//         `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim()
//       ).filter(Boolean);

//       const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });
//       for (let i = 0; i < chunks.length; i++) {
//         const embedding = await generateEmbedding(chunks[i]);
//         await collection.add({
//           ids: [`${meetingId}_chunk_${i}`],
//           embeddings: [embedding],
//           documents: [chunks[i]],
//           metadatas: [{
//             meetingId: meetingId.toString(),
//             domain: meeting.domain,
//             date: meeting.scheduledDate.toISOString(),
//             attendees: attendeeNames.join(', '),
//             chunkIndex: i
//           }]
//         });
//       }
//     } catch (e) {
//       logger.warn(`Embedding failed: ${e.message}`);
//     }
//     await updateStep(meetingId, 'embedding', 'done', 'Embeddings stored', io);

//     for (const attendee of meeting.attendees) {
//       try {
//         const performance = await Performance.findOne({ user: attendee.user._id });
//         if (performance) {
//           performance.meetingStats = performance.meetingStats || { totalMeetings: 0, avgContributionScore: 0 };
//           performance.meetingStats.totalMeetings += 1;
//           const prevAvg = performance.meetingStats.avgContributionScore || 0;
//           const prevCount = performance.meetingStats.totalMeetings - 1;
//           const newScore = attendee.contributionScore || 5;
//           const newAvg = (prevAvg * prevCount + newScore) / performance.meetingStats.totalMeetings;
//           performance.meetingStats.avgContributionScore = isNaN(newAvg) ? 5 : newAvg;
//           await performance.save();
//         }
//       } catch (e) {
//         logger.warn(`Performance update failed: ${e.message}`);
//       }
//     }

//     await Meeting.findByIdAndUpdate(meetingId, {
//       status: 'ready',
//       transcriptRaw: meeting.transcriptRaw,
//       transcriptSegments: meeting.transcriptSegments,
//       speakerDiarizationMethod: meeting.speakerDiarizationMethod,
//       speakerDiarizationEditable: meeting.speakerDiarizationEditable,
//       actualDuration: meeting.actualDuration,
//       summary: meeting.summary,
//       conclusions: (meeting.conclusions || []).filter(Boolean),
//       decisions: (meeting.decisions || []).filter(Boolean),
//       followUpTopics: (meeting.followUpTopics || []).filter(Boolean),
//       actionItems: (meeting.actionItems || []).filter(item => item && item.task),
//       attendeeContributions: (meeting.attendeeContributions || []).filter(Boolean),
//       attendees: meeting.attendees,
//     }, { new: true });

//     await updateStep(meetingId, 'ready', 'done', 'Meeting processing complete', io);

//     await Notification.create({
//       user: meeting.host,
//       type: 'meeting_ready',
//       title: 'Meeting analysis ready',
//       message: `"${meeting.name}" has been processed and is ready for review`,
//       link: `/meetings/${meeting._id}`,
//       entityType: 'meeting',
//       entityId: meeting._id
//     });

//     logger.info(`Meeting ${meetingId} processing complete — method: ${meeting.speakerDiarizationMethod}`);

//   } catch (error) {
//     logger.error(`Processing error for meeting ${meetingId}: ${error.message}`);
//     try {
//       await Meeting.findByIdAndUpdate(meetingId, {
//         status: 'completed',
//         processingError: error.message,
//         $set: { 'processingSteps.$[elem].status': 'failed' }
//       }, { arrayFilters: [{ 'elem.status': 'running' }] });
//     } catch (updateError) {
//       logger.error(`Failed to update meeting status: ${updateError.message}`);
//     }
//     throw error;
//   }
// }

// const worker = new Worker('meeting-processing', processMeeting, {
//   connection: { url: process.env.REDIS_URL },
//   concurrency: 2
// });

// worker.on('completed', (job) => logger.info(`Job ${job.id} completed`));
// worker.on('failed', (job, err) => logger.error(`Job ${job.id} failed: ${err.message}`));

// const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000;

// async function pingDiarizationService() {
//   try {
//     const res = await fetch(`${DIARIZATION_URL}/health`, { timeout: 8000 });
//     const data = await res.json();
//     if (data.pipeline_loaded) {
//       logger.info('Diarization keep-alive: pipeline loaded');
//     } else {
//       logger.warn('Diarization keep-alive: pipeline not loaded yet');
//     }
//   } catch (e) {
//     logger.warn(`Diarization keep-alive failed: ${e.message}`);
//   }
// }

// pingDiarizationService();
// const keepAliveTimer = setInterval(pingDiarizationService, KEEP_ALIVE_INTERVAL);

// const workerHealthTimer = setInterval(() => {
//   logger.info(`Worker alive, uptime: ${Math.round(process.uptime())}s`);
// }, 5 * 60 * 1000);

// process.on('SIGTERM', () => {
//   clearInterval(keepAliveTimer);
//   clearInterval(workerHealthTimer);
//   logger.info('Worker shutting down gracefully');
//   process.exit(0);
// });

// module.exports = worker;

const { Worker } = require('bullmq');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const Groq = require('groq-sdk');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { Meeting, PromptTemplate, Performance, Notification } = require('../models');
const { chromaClient } = require('../config/chroma');
const { generateEmbedding } = require('../ai/embeddings');
const { meetingAnalysisChain, chunkTranscript, scoreAttendeeChain } = require('../ai/langchain');
const { getFileUrl, uploadFile } = require('../config/s3');
const winston = require('winston');

const execAsync = promisify(require('child_process').exec);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const DIARIZATION_URL = process.env.DIARIZATION_URL || 'http://diarization:8001';

// ─────────────────────────────────────────────────────────────────────────────
// Hallucination filter
// ─────────────────────────────────────────────────────────────────────────────
const HALLUCINATION_PHRASES = new Set([
  'thank you',
  'thank you very much',
  'thanks for watching',
  'thanks for listening',
  'please subscribe',
  'see you next time',
  'bye bye',
  'goodbye',
  'you',
  'thanks',
  'thank you for watching',
  'thank you for listening',
  'subtitles by',
  'subscribe to',
  'like and subscribe',
  "i'll see you in the next one",
  "don't forget to subscribe",
]);

function filterHallucination(text) {
  if (!text || !text.trim()) return '';
  const trimmed = text.trim().toLowerCase().replace(/[.,!?]+$/, '');
  if (HALLUCINATION_PHRASES.has(trimmed)) {
    logger.warn(`Hallucination filtered: "${text.trim()}"`);
    return '';
  }
  return text.trim();
}

async function updateStep(meetingId, step, status, message = null, io = null) {
  const meeting = await Meeting.findById(meetingId);
  if (meeting) {
    const stepObj = meeting.processingSteps.find(s => s.step === step);
    if (stepObj) {
      stepObj.status = status;
      stepObj.timestamp = new Date();
      if (message) stepObj.message = message;
    }
    await meeting.save();
    if (io) io.to(meetingId).emit('processing-update', { step, status, message });
  }
}

async function downloadAudio(audioKey) {
  const url = await getFileUrl(audioKey, 3600);
  const tempDir = '/temp';
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const localPath = path.join(tempDir, `${Date.now()}-${path.basename(audioKey)}`);
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buffer));
  return localPath;
}

function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { logger.warn(`ffprobe error: ${err.message}`); return resolve(0); }
      const duration = metadata?.format?.duration;
      resolve(typeof duration === 'number' && !isNaN(duration) ? duration : 0);
    });
  });
}

async function splitAudioWithOverlap(filePath, chunkDuration = 590, overlap = 10) {
  const outputDir = '/temp/chunks';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const totalDuration = await getAudioDuration(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  const chunkPaths = [];

  let start = 0;
  let index = 0;

  while (start < totalDuration) {
    const outputPath = path.join(
      outputDir,
      `${baseName}_chunk_${String(index).padStart(3, '0')}.wav`
    );
    const segmentLength = Math.min(chunkDuration + overlap, totalDuration - start);

    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .seekInput(start)
        .duration(segmentLength)
        .output(outputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    chunkPaths.push({ path: outputPath, startTime: start });
    start += chunkDuration;
    index++;
  }

  logger.info(`Split into ${chunkPaths.length} overlapping chunks`);
  return chunkPaths;
}

async function transcribeWithGroq(audioPath) {
  try {
    logger.info(`Transcribing: ${audioPath}`);
    const audioStream = fs.createReadStream(audioPath);
    const transcription = await groq.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      language: 'en',
      temperature: 0,
    });

    if (transcription.segments) {
      transcription.segments = transcription.segments
        .map(seg => ({ ...seg, text: filterHallucination(seg.text) }))
        .filter(seg => seg.text.length > 0);
    }

    if (transcription.text) {
      transcription.text = transcription.segments && transcription.segments.length > 0
        ? transcription.segments.map(s => s.text).join(' ')
        : filterHallucination(transcription.text);
    }

    return transcription;
  } catch (error) {
    logger.error(`Groq transcription error: ${error.message}`);
    throw error;
  }
}

async function diarizeWithPyannote(audioPath, numSpeakers) {
  try {
    const healthRes = await fetch(`${DIARIZATION_URL}/health`, { timeout: 5000 });
    const health = await healthRes.json();
    if (!health.pipeline_loaded) {
      logger.warn('Pyannote pipeline not loaded — falling back to LLM diarization');
      return null;
    }

    logger.info(`Sending audio to pyannote diarization service (num_speakers=${numSpeakers})`);

    const form = new FormData();
    form.append('file', fs.createReadStream(audioPath), {
      filename: path.basename(audioPath),
      contentType: 'audio/wav'
    });

    const url = numSpeakers > 1
      ? `${DIARIZATION_URL}/diarize?num_speakers=${numSpeakers}`
      : `${DIARIZATION_URL}/diarize`;

    const response = await fetch(url, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      timeout: 300000
    });

    if (!response.ok) {
      const err = await response.text();
      logger.warn(`Pyannote diarization failed: ${err} — falling back to LLM`);
      return null;
    }

    const result = await response.json();
    logger.info(`Pyannote complete: ${result.segments.length} segments, ${result.num_speakers_detected} speakers`);
    return result.segments;

  } catch (error) {
    logger.warn(`Pyannote service unreachable: ${error.message} — falling back to LLM diarization`);
    return null;
  }
}

function mergeTranscriptWithDiarization(groqSegments, diarSegments, attendeeNames) {
  const speakingTime = {};
  for (const seg of diarSegments) {
    const duration = (seg.end || 0) - (seg.start || 0);
    speakingTime[seg.speaker] = (speakingTime[seg.speaker] || 0) + duration;
  }

  const sortedSpeakers = Object.keys(speakingTime).sort(
    (a, b) => speakingTime[b] - speakingTime[a]
  );

  const speakerMap = {};
  sortedSpeakers.forEach((speaker, idx) => {
    speakerMap[speaker] = attendeeNames[idx % attendeeNames.length];
  });

  logger.info(`Speaker mapping: ${JSON.stringify(speakerMap)}`);

  return groqSegments.map(seg => {
    const midpoint = ((seg.start || 0) + (seg.end || 0)) / 2;
    const diarSeg = diarSegments.find(d => d.start <= midpoint && midpoint <= d.end);
    const closestSeg = diarSeg || diarSegments.reduce((closest, d) => {
      if (!closest) return d;
      return Math.abs(d.start - midpoint) < Math.abs(closest.start - midpoint) ? d : closest;
    }, null);

    const speaker = closestSeg
      ? (speakerMap[closestSeg.speaker] || attendeeNames[0])
      : attendeeNames[0];

    return { ...seg, speaker };
  });
}

function mergeShortSegments(segments, minDuration = 1.0) {
  if (!segments || segments.length === 0) return [];
  const merged = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const duration = (current.end || 0) - (current.start || 0);
    const endsWithPunctuation = /[.!?]$/.test(current.text?.trim() || '');

    if (duration < minDuration || !endsWithPunctuation) {
      current = {
        ...current,
        end: seg.end,
        text: (current.text || '').trim() + ' ' + (seg.text || '').trim()
      };
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);
  return merged;
}

async function inferSpeakersWithLLM(segments, attendeeNames, hostName = null) {
  if (!segments || segments.length === 0) return [];

  if (attendeeNames.length === 1) {
    return segments.map(seg => ({ ...seg, speaker: attendeeNames[0] }));
  }

  const batchSize = 30;
  const allLabeled = [];

  for (let batchStart = 0; batchStart < segments.length; batchStart += batchSize) {
    const batch = segments.slice(batchStart, batchStart + batchSize);
    const isFirstBatch = batchStart === 0;

    const segmentList = batch.map((seg, localIdx) =>
      `[${localIdx}] ${seg.text?.trim()}`
    ).join('\n');

    const hostLine = hostName
      ? `\nIMPORTANT: "${hostName}" is the meeting host. They almost certainly spoke first (segment [0]). Assign them to early segments unless the text clearly shows otherwise.\n`
      : '';

    const firstBatchNote = isFirstBatch
      ? '\nNOTE: This is the very start of the meeting. The host typically opens with greetings or agenda.\n'
      : '';

    const prompt = `You are analyzing a meeting transcript. The meeting has exactly these attendees (use ONLY these exact names):
${attendeeNames.map((n, i) => `- Speaker ${i + 1}: ${n}`).join('\n')}
${hostLine}${firstBatchNote}
Rules:
1. Use ONLY the exact names listed above — no titles, no roles
2. Assign each segment to one speaker based on conversation flow and context
3. Look for: questions followed by answers, topic handoffs, first-person references
4. A speaker can have multiple consecutive segments
5. The host typically opens and closes the meeting

Segments to label:
${segmentList}

Return ONLY a valid JSON array (no markdown, no explanation):
[{"index":0,"speaker":"${attendeeNames[0]}"},{"index":1,"speaker":"${attendeeNames[Math.min(1, attendeeNames.length - 1)]}"}]`;

    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096
      });

      const content = response.choices[0]?.message?.content || '[]';
      const clean = content.replace(/```json|```/g, '').trim();
      let assignments = [];
      try {
        assignments = JSON.parse(clean);
      } catch (parseErr) {
        const match = clean.match(/\[[\s\S]*\]/);
        if (match) assignments = JSON.parse(match[0]);
      }

      batch.forEach((seg, localIdx) => {
        const assignment = assignments.find(a => a.index === localIdx);
        const assignedName = assignment?.speaker?.trim();
        const validName = attendeeNames.includes(assignedName)
          ? assignedName
          : attendeeNames[localIdx % attendeeNames.length];
        allLabeled.push({ ...seg, speaker: validName });
      });

    } catch (error) {
      logger.warn(`LLM speaker inference failed for batch at ${batchStart}: ${error.message}`);
      batch.forEach((seg, localIdx) => {
        allLabeled.push({
          ...seg,
          speaker: attendeeNames[(batchStart + localIdx) % attendeeNames.length]
        });
      });
    }
  }

  return allLabeled;
}

// ─────────────────────────────────────────────────────────────────────────────
// processPerDeviceAudio
//
// FIX: Timeline normalization for per-device recordings.
//
// ROOT CAUSE OF THE BUG:
// Each participant records their own audio independently. When Whisper
// transcribes a recording it always starts its timestamps at t=0 — meaning
// the first segment of EVERY participant's audio gets startTime=0, regardless
// of when they actually spoke in the meeting.
//
// For example, if Alice started recording at 10:00:00 and Bob at 10:00:15,
// and Alice said "Good morning" at second 2 of her recording, and Bob said
// "Hi" at second 1 of his recording, without normalization both appear at
// t=0 and t=1/2 with no way to know Bob spoke 15 seconds after Alice.
//
// THE FIX:
// 1. The client now sends `recordingStartTime` (ms epoch) with every audio chunk.
// 2. The server stores the earliest recordingStartTime per user.
// 3. Here, we find the minimum recordingStartTime across all devices (the
//    participant who started recording first = t=0 of the meeting timeline).
// 4. Each segment's startTime is shifted by:
//    (device.recordingStartTime - earliestRecordingStartTime) / 1000 seconds
// 5. After normalization, all segments share a common timeline and sorting
//    them by startTime produces the correct chronological order.
// ─────────────────────────────────────────────────────────────────────────────
async function processPerDeviceAudio(perDeviceAudio, meetingId) {
  logger.info(`Processing per-device audio for ${perDeviceAudio.length} participants`);

  const tempDir = '/temp';
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const allSegments = [];

  for (const device of perDeviceAudio) {
    const { userId, userName, audioKey } = device;
    logger.info(`Transcribing audio for ${userName} (${userId})`);

    let localPath = null;
    try {
      localPath = await downloadAudio(audioKey);

      const stat = fs.statSync(localPath);
      if (stat.size < 1000) {
        logger.warn(`Audio for ${userName} too small (${stat.size} bytes) — skipping`);
        continue;
      }

      const result = await transcribeWithGroq(localPath);
      const segments = result?.segments || [];

      logger.info(`${userName}: ${segments.length} segments transcribed`);

      for (const seg of segments) {
        const text = seg.text?.trim();
        if (!text || text.length < 2) continue;

        allSegments.push({
          speaker: userName,
          text,
          startTime: seg.start || 0,
          endTime: seg.end || 0,
          start: seg.start || 0,
          end: seg.end || 0,
          userId,
          source: 'per-device',
          // ── FIX: Temporarily store device start time for offset calc ──────
          // This field is deleted after normalization — it never reaches MongoDB.
          _deviceRecordingStart: device.recordingStartTime || 0,
          // ─────────────────────────────────────────────────────────────────
        });
      }

    } catch (e) {
      logger.warn(`Failed to process audio for ${userName}: ${e.message}`);
    } finally {
      if (localPath) {
        try { fs.unlinkSync(localPath); } catch (e) {}
      }
    }
  }

  if (allSegments.length === 0) {
    logger.warn('No segments from per-device audio — will fall back to mixed audio');
    return null;
  }

  // ── FIX: Normalize all per-device timestamps to a shared meeting timeline ─
  //
  // Find the earliest wall-clock recording start across all devices.
  // This device started first, so its t=0 IS the meeting t=0.
  // Every other device's segments are shifted forward by their offset.
  //
  // Example:
  //   Alice recordingStartTime = 1700000000000 (earliest → offset = 0s)
  //   Bob   recordingStartTime = 1700000015000 (15s later → offset = 15s)
  //
  //   Alice segment at Whisper t=2s  → meeting t = 2 + 0  = 2s
  //   Bob   segment at Whisper t=1s  → meeting t = 1 + 15 = 16s
  //
  // Result: Bob's "Hi" correctly appears after Alice's "Good morning".
  const validStartTimes = perDeviceAudio
    .map(d => d.recordingStartTime)
    .filter(t => t && t > 0);

  if (validStartTimes.length > 0) {
    const earliestStart = Math.min(...validStartTimes);
    logger.info(`Timeline normalization — earliest device start: ${earliestStart}`);

    for (const seg of allSegments) {
      const deviceOffset = ((seg._deviceRecordingStart || earliestStart) - earliestStart) / 1000; // ms → seconds
      seg.startTime = seg.startTime + deviceOffset;
      seg.endTime   = seg.endTime   + deviceOffset;
      seg.start     = seg.startTime;
      seg.end       = seg.endTime;
      delete seg._deviceRecordingStart; // clean up — never saved to DB
    }

    logger.info(`Normalized ${allSegments.length} segments across ${perDeviceAudio.length} devices`);
  } else {
    // No recordingStartTime available (old clients) — clean up temp field and
    // fall through to sort-only behavior, same as before the fix.
    logger.warn('No recordingStartTime data — skipping normalization (old client fallback)');
    for (const seg of allSegments) {
      delete seg._deviceRecordingStart;
    }
  }
  // ── End normalization ──────────────────────────────────────────────────────

  // Sort chronologically — now meaningful because timestamps are normalized
  allSegments.sort((a, b) => a.startTime - b.startTime);

  // Deduplication — remove hallucinated repeats within 15s with 80% text similarity
  const dedupedSegments = [];
  for (const seg of allSegments) {
    const isDuplicate = dedupedSegments.some(existing => {
      const a = existing.text.trim().toLowerCase();
      const b = seg.text.trim().toLowerCase();
      const timeDiff = Math.abs(seg.startTime - existing.startTime);
      const longer = Math.max(a.length, b.length);
      const shorter = Math.min(a.length, b.length);
      return timeDiff < 15 && longer > 0 && shorter / longer > 0.8;
    });
    if (!isDuplicate) dedupedSegments.push(seg);
  }

  logger.info(`Per-device pipeline: ${dedupedSegments.length} segments from ${perDeviceAudio.length} participants`);
  return dedupedSegments;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function processMeeting(job) {
  const { meetingId, audioKey, perDeviceAudio } = job.data;
  const io = global.io;
  logger.info(`Starting processing for meeting ${meetingId}`);
  logger.info(`Per-device audio available: ${perDeviceAudio?.length || 0} participants`);

  try {
    const meeting = await Meeting.findById(meetingId)
      .populate('attendees.user', 'firstName lastName');

    if (!meeting) throw new Error('Meeting not found');

    const hostAttendee = meeting.attendees.find(
      a => a.user?._id?.toString() === meeting.host?.toString()
    );
    const hostName = hostAttendee?.user
      ? `${hostAttendee.user.firstName} ${hostAttendee.user.lastName}`.trim()
      : null;

    logger.info(`Meeting host: ${hostName || 'unknown'}`);

    await updateStep(meetingId, 'upload', 'done', 'Audio received', io);
    await updateStep(meetingId, 'transcription', 'running', 'Starting transcription', io);

    let transcriptSegments = null;
    let transcript = '';
    let usedPerDevice = false;

    // ── PATH 1: Per-device audio (preferred) ─────────────────────────────────
    if (perDeviceAudio && perDeviceAudio.length > 0) {
      logger.info('Using per-device audio pipeline — timeline normalization enabled');
      try {
        transcriptSegments = await processPerDeviceAudio(perDeviceAudio, meetingId);
        if (transcriptSegments && transcriptSegments.length > 0) {
          transcript = transcriptSegments.map(s => `${s.speaker}: ${s.text}`).join('\n');
          usedPerDevice = true;
          meeting.speakerDiarizationMethod = 'per-device';
          logger.info(`Per-device transcription success: ${transcriptSegments.length} segments`);
        } else {
          logger.warn('Per-device pipeline returned no segments — falling back to mixed audio');
        }
      } catch (e) {
        logger.warn(`Per-device pipeline failed: ${e.message} — falling back to mixed audio`);
      }
    }

    // ── PATH 2: Mixed audio fallback ─────────────────────────────────────────
    if (!usedPerDevice && audioKey) {
      logger.info('Using mixed audio pipeline with diarization');

      const localAudioPath = await downloadAudio(audioKey);
      const rawDuration = await getAudioDuration(localAudioPath);
      meeting.actualDuration = (rawDuration && !isNaN(rawDuration)) ? Math.round(rawDuration / 60) : 0;
      logger.info(`Audio duration: ${rawDuration}s`);

      let groqResult = null;
      const fileSizeMB = fs.statSync(localAudioPath).size / (1024 * 1024);

      if (fileSizeMB > 24 || rawDuration > 590) {
        logger.info('Large file — splitting into overlapping chunks');
        const chunks = await splitAudioWithOverlap(localAudioPath);
        const allSegments = [];

        for (const chunk of chunks) {
          const chunkResult = await transcribeWithGroq(chunk.path);
          transcript += (chunkResult?.text || '') + '\n';
          if (chunkResult?.segments) {
            chunkResult.segments.forEach(seg => {
              allSegments.push({
                ...seg,
                start: (seg.start || 0) + chunk.startTime,
                end: (seg.end || 0) + chunk.startTime
              });
            });
          }
          try { fs.unlinkSync(chunk.path); } catch (e) {}
        }
        groqResult = { text: transcript, segments: allSegments };
      } else {
        groqResult = await transcribeWithGroq(localAudioPath);
        transcript = groqResult?.text || '';
      }

      meeting.transcriptRaw = transcript;
      logger.info(`Transcription done. Text: ${transcript.length} chars, segments: ${groqResult?.segments?.length || 0}`);
      await updateStep(meetingId, 'transcription', 'done', 'Transcription complete', io);

      await updateStep(meetingId, 'diarization', 'running', 'Identifying speakers', io);

      const joinedAttendees = meeting.attendees.filter(
        a => a.attended === true || a.joinedAt !== null
      );
      const activeAttendees = joinedAttendees.length > 0 ? joinedAttendees : meeting.attendees;
      const attendeeNames = activeAttendees
        .map(a => `${(a.user?.firstName || '').trim()} ${(a.user?.lastName || '').trim()}`.trim())
        .filter(name => name.length > 0);

      logger.info(`Attendees for diarization: ${attendeeNames.join(', ')}`);

      const rawSegments = (groqResult?.segments || []).map(seg => ({
        text: seg.text?.trim() || '',
        startTime: seg.start || 0,
        endTime: seg.end || 0,
        start: seg.start || 0,
        end: seg.end || 0
      })).filter(seg => seg.text.length > 0);

      const numSpeakers = attendeeNames.length;
      const diarSegments = await diarizeWithPyannote(localAudioPath, numSpeakers);

      let labeledSegments;
      if (diarSegments && diarSegments.length > 0) {
        logger.info(`Using pyannote diarization (${diarSegments.length} segments)`);
        labeledSegments = mergeTranscriptWithDiarization(rawSegments, diarSegments, attendeeNames);
        meeting.speakerDiarizationMethod = 'pyannote';
      } else {
        logger.info('Pyannote unavailable — using LLM speaker inference fallback');
        const segmentsToLabel = rawDuration < 600 ? rawSegments : mergeShortSegments(rawSegments);
        labeledSegments = await inferSpeakersWithLLM(segmentsToLabel, attendeeNames, hostName);
        meeting.speakerDiarizationMethod = 'llm';
      }

      const rawMappedSegments = labeledSegments.map(seg => ({
        speaker: seg.speaker || 'Unknown Speaker',
        startTime: seg.startTime || seg.start || 0,
        endTime: seg.endTime || seg.end || 0,
        text: seg.text || ''
      }));

      const dedupedSegments = [];
      for (const seg of rawMappedSegments) {
        const isDuplicate = dedupedSegments.some(existing => {
          const a = existing.text.trim().toLowerCase();
          const b = seg.text.trim().toLowerCase();
          const timeDiff = Math.abs(seg.startTime - existing.startTime);
          const longer = Math.max(a.length, b.length);
          const shorter = Math.min(a.length, b.length);
          return timeDiff < 15 && longer > 0 && shorter / longer > 0.8;
        });
        if (!isDuplicate) dedupedSegments.push(seg);
      }

      transcriptSegments = dedupedSegments;
      try { fs.unlinkSync(localAudioPath); } catch (e) {}
    }

    // Final sort — always sort by startTime before saving
    if (transcriptSegments && transcriptSegments.length > 0) {
      transcriptSegments.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    }

    meeting.transcriptRaw = transcript || transcriptSegments?.map(s => `${s.speaker}: ${s.text}`).join('\n') || '';
    meeting.transcriptSegments = transcriptSegments || [];
    meeting.speakerDiarizationEditable = true;

    if (usedPerDevice) {
      await updateStep(meetingId, 'transcription', 'done', `Transcribed ${perDeviceAudio.length} participants`, io);
      await updateStep(meetingId, 'diarization', 'done', 'Speaker attribution via per-device audio — 100% accurate', io);
    } else {
      await updateStep(meetingId, 'diarization', 'done', 'Speaker identification complete', io);
    }

    logger.info(`Final segments: ${meeting.transcriptSegments.length}, method: ${meeting.speakerDiarizationMethod}`);

    // Step 4: Analysis
    await updateStep(meetingId, 'analysis', 'running', 'Analyzing meeting content', io);

    const promptTemplate = await PromptTemplate.findOne({ domain: meeting.domain, isActive: true });

    const analysis = await meetingAnalysisChain(
      meeting.transcriptRaw,
      meeting.domain,
      meeting.attendees.map(a => a.user),
      promptTemplate || {
        systemPrompt: 'You are a meeting analyst. Analyze the meeting transcript and return structured insights.',
        userPromptTemplate: 'Analyze this {domain} meeting transcript:\n\n{transcript}\n\nAttendees: {attendees}\n\nReturn JSON with: summary, conclusions, decisions, actionItems (array with owner/task/deadline fields), followUpTopics, attendeeContributions (array with name/score/keyPoints fields)'
      },
      meeting.transcriptSegments
    );

    meeting.summary = analysis.summary;
    meeting.conclusions = analysis.conclusions || [];
    meeting.decisions = analysis.decisions || [];
    meeting.actionItems = (analysis.actionItems || []).map(item => {
      let deadline = null;
      if (item.deadline) {
        const parsed = new Date(item.deadline);
        deadline = isNaN(parsed.getTime()) ? null : parsed;
      }
      return {
        owner: meeting.attendees.find(a => {
          const name = `${a.user?.firstName} ${a.user?.lastName}`.toLowerCase();
          return name.includes((item.owner || '').toLowerCase());
        })?.user?._id || meeting.host,
        task: item.task,
        deadline,
        status: 'pending'
      };
    });
    meeting.followUpTopics = analysis.followUpTopics || [];

    meeting.attendeeContributions = [];

    for (const attendee of meeting.attendees) {
      const name = `${attendee.user?.firstName} ${attendee.user?.lastName}`.trim();
      try {
        const contribution = await scoreAttendeeChain(
          name,
          meeting.transcriptRaw,
          meeting.domain,
          meeting.transcriptSegments
        );
        const score = (contribution.score && !isNaN(contribution.score)) ? contribution.score : 5;
        attendee.contributionScore = score;
        attendee.keyPoints = contribution.keyPoints || [];

        meeting.attendeeContributions.push({
          user: attendee.user._id,
          name,
          score,
          keyPoints: contribution.keyPoints || [],
          speakingTime: 0
        });
      } catch (e) {
        logger.warn(`Score failed for ${name}: ${e.message}`);
        meeting.attendeeContributions.push({
          user: attendee.user._id,
          name,
          score: 5,
          keyPoints: [],
          speakingTime: 0
        });
      }
    }

    await updateStep(meetingId, 'analysis', 'done', 'Analysis complete', io);

    // Step 5: Embeddings
    await updateStep(meetingId, 'embedding', 'running', 'Storing embeddings', io);
    try {
      const speakerChunks = [];
      let currentChunk = '';
      let currentWordCount = 0;
      const CHUNK_WORD_LIMIT = 300;

      for (const seg of meeting.transcriptSegments) {
        const line = `${seg.speaker}: ${seg.text}`;
        const wordCount = line.split(' ').length;
        if (currentWordCount + wordCount > CHUNK_WORD_LIMIT && currentChunk.length > 0) {
          speakerChunks.push(currentChunk.trim());
          currentChunk = '';
          currentWordCount = 0;
        }
        currentChunk += line + '\n';
        currentWordCount += wordCount;
      }
      if (currentChunk.trim().length > 0) speakerChunks.push(currentChunk.trim());

      const chunks = speakerChunks.length > 0 ? speakerChunks : chunkTranscript(meeting.transcriptRaw, 300);
      const attendeeNames = meeting.attendees.map(a =>
        `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim()
      ).filter(Boolean);

      const collection = await chromaClient.getCollection({ name: 'meeting_transcripts' });
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateEmbedding(chunks[i]);
        await collection.add({
          ids: [`${meetingId}_chunk_${i}`],
          embeddings: [embedding],
          documents: [chunks[i]],
          metadatas: [{
            meetingId: meetingId.toString(),
            domain: meeting.domain,
            date: meeting.scheduledDate.toISOString(),
            attendees: attendeeNames.join(', '),
            chunkIndex: i
          }]
        });
      }
    } catch (e) {
      logger.warn(`Embedding failed: ${e.message}`);
    }
    await updateStep(meetingId, 'embedding', 'done', 'Embeddings stored', io);

    for (const attendee of meeting.attendees) {
      try {
        const performance = await Performance.findOne({ user: attendee.user._id });
        if (performance) {
          performance.meetingStats = performance.meetingStats || { totalMeetings: 0, avgContributionScore: 0 };
          performance.meetingStats.totalMeetings += 1;
          const prevAvg = performance.meetingStats.avgContributionScore || 0;
          const prevCount = performance.meetingStats.totalMeetings - 1;
          const newScore = attendee.contributionScore || 5;
          const newAvg = (prevAvg * prevCount + newScore) / performance.meetingStats.totalMeetings;
          performance.meetingStats.avgContributionScore = isNaN(newAvg) ? 5 : newAvg;
          await performance.save();
        }
      } catch (e) {
        logger.warn(`Performance update failed: ${e.message}`);
      }
    }

    await Meeting.findByIdAndUpdate(meetingId, {
      status: 'ready',
      transcriptRaw: meeting.transcriptRaw,
      transcriptSegments: meeting.transcriptSegments,
      speakerDiarizationMethod: meeting.speakerDiarizationMethod,
      speakerDiarizationEditable: meeting.speakerDiarizationEditable,
      actualDuration: meeting.actualDuration,
      summary: meeting.summary,
      conclusions: (meeting.conclusions || []).filter(Boolean),
      decisions: (meeting.decisions || []).filter(Boolean),
      followUpTopics: (meeting.followUpTopics || []).filter(Boolean),
      actionItems: (meeting.actionItems || []).filter(item => item && item.task),
      attendeeContributions: (meeting.attendeeContributions || []).filter(Boolean),
      attendees: meeting.attendees,
    }, { new: true });

    await updateStep(meetingId, 'ready', 'done', 'Meeting processing complete', io);

    await Notification.create({
      user: meeting.host,
      type: 'meeting_ready',
      title: 'Meeting analysis ready',
      message: `"${meeting.name}" has been processed and is ready for review`,
      link: `/meetings/${meeting._id}`,
      entityType: 'meeting',
      entityId: meeting._id
    });

    logger.info(`Meeting ${meetingId} processing complete — method: ${meeting.speakerDiarizationMethod}`);

  } catch (error) {
    logger.error(`Processing error for meeting ${meetingId}: ${error.message}`);
    try {
      await Meeting.findByIdAndUpdate(meetingId, {
        status: 'completed',
        processingError: error.message,
        $set: { 'processingSteps.$[elem].status': 'failed' }
      }, { arrayFilters: [{ 'elem.status': 'running' }] });
    } catch (updateError) {
      logger.error(`Failed to update meeting status: ${updateError.message}`);
    }
    throw error;
  }
}

const worker = new Worker('meeting-processing', processMeeting, {
  connection: { url: process.env.REDIS_URL },
  concurrency: 2
});

worker.on('completed', (job) => logger.info(`Job ${job.id} completed`));
worker.on('failed', (job, err) => logger.error(`Job ${job.id} failed: ${err.message}`));

const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000;

async function pingDiarizationService() {
  try {
    const res = await fetch(`${DIARIZATION_URL}/health`, { timeout: 8000 });
    const data = await res.json();
    if (data.pipeline_loaded) {
      logger.info('Diarization keep-alive: pipeline loaded');
    } else {
      logger.warn('Diarization keep-alive: pipeline not loaded yet');
    }
  } catch (e) {
    logger.warn(`Diarization keep-alive failed: ${e.message}`);
  }
}

pingDiarizationService();
const keepAliveTimer = setInterval(pingDiarizationService, KEEP_ALIVE_INTERVAL);

const workerHealthTimer = setInterval(() => {
  logger.info(`Worker alive, uptime: ${Math.round(process.uptime())}s`);
}, 5 * 60 * 1000);

process.on('SIGTERM', () => {
  clearInterval(keepAliveTimer);
  clearInterval(workerHealthTimer);
  logger.info('Worker shutting down gracefully');
  process.exit(0);
});

module.exports = worker;