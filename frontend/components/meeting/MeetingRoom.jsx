'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SimplePeer from 'simple-peer';
import {
  Mic, MicOff, Video, VideoOff, Phone,
  MessageSquare, ScreenShare, StopCircle,
  Hand, Users, Circle,
  Pin, PinOff, Maximize2, Minimize2, X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSocket, joinRoom, leaveRoom } from '@/lib/socket';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

// ── Audio analyser hook ────────────────────────────────────────────────────
// Returns a live volume level (0–1) for any MediaStream.
// Uses a single shared AudioContext per component tree to avoid hitting
// the browser's 6-context limit on Chrome.
const sharedAudioContext = { current: null };

function getAudioContext() {
  if (!sharedAudioContext.current || sharedAudioContext.current.state === 'closed') {
    sharedAudioContext.current = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedAudioContext.current;
}

function useAudioLevel(stream, enabled = true) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    let cancelled = false;

    try {
      const ctx = getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6; // smooths the blink so it feels organic
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;
      sourceRef.current = source;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (cancelled) return;
        analyser.getByteFrequencyData(data);
        // RMS across frequency bins gives a perceptually accurate loudness reading
        const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
        // Normalise to 0–1. 128 is a comfortable max for speech.
        setLevel(Math.min(rms / 80, 1));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('AudioContext setup failed:', e.message);
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        sourceRef.current?.disconnect();
        analyserRef.current?.disconnect();
      } catch (_) { }
    };
  }, [stream, enabled]);

  return level;
}

// ── Active speaker detection ───────────────────────────────────────────────
// Determines who is currently the dominant speaker across all participants.
// A participant must exceed the threshold for 300ms before becoming "active"
// to prevent rapid flicker between speakers.
const SPEAKING_THRESHOLD = 0.08;   // minimum volume to count as speaking
const SPEAKING_DEBOUNCE_MS = 300;  // must speak continuously for this long

function useActiveSpeaker(audioLevels) {
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const debounceTimers = useRef({});
  const lastActiveRef = useRef(null);

  useEffect(() => {
    // Find loudest participant above threshold
    let loudestId = null;
    let loudestLevel = SPEAKING_THRESHOLD;

    Object.entries(audioLevels).forEach(([id, level]) => {
      if (level > loudestLevel) {
        loudestLevel = level;
        loudestId = id;
      }
    });

    if (loudestId === lastActiveRef.current) return;

    if (loudestId) {
      // Debounce: only switch active speaker after sustained speaking
      if (!debounceTimers.current[loudestId]) {
        debounceTimers.current[loudestId] = setTimeout(() => {
          lastActiveRef.current = loudestId;
          setActiveSpeakerId(loudestId);
          delete debounceTimers.current[loudestId];
        }, SPEAKING_DEBOUNCE_MS);
      }
    } else {
      // No one speaking — clear after a short grace period
      const clearTimer = setTimeout(() => {
        lastActiveRef.current = null;
        setActiveSpeakerId(null);
      }, 800);
      return () => clearTimeout(clearTimer);
    }

    return () => {
      if (loudestId && debounceTimers.current[loudestId]) {
        clearTimeout(debounceTimers.current[loudestId]);
        delete debounceTimers.current[loudestId];
      }
    };
  }, [audioLevels]);

  return activeSpeakerId;
}

export default function MeetingRoom({ meetingId, user }) {
  const router = useRouter();
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const mediaRecorderRef = useRef(null);
  const myRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const myChunksRef = useRef([]);
  const chunkIntervalRef = useRef(null);
  const chatBottomRef = useRef(null);
  const fullscreenContainerRef = useRef(null);

  const [participantNames, setParticipantNames] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [pinnedUserId, setPinnedUserId] = useState(null);
  const [fullscreenUserId, setFullscreenUserId] = useState(null);
  const [meetingCancelled, setMeetingCancelled] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isMyRecording, setIsMyRecording] = useState(false);

  // ── Audio level state for all participants ─────────────────────────────
  // We store levels in a ref AND state so the active-speaker hook gets
  // fresh values on every animation frame without re-rendering the whole tree.
  const [audioLevels, setAudioLevels] = useState({});
  const audioLevelsRef = useRef({});

  const updateAudioLevel = useCallback((id, level) => {
    audioLevelsRef.current[id] = level;
    setAudioLevels(prev => {
      // Only trigger re-render if the level changed meaningfully (>2%)
      if (Math.abs((prev[id] || 0) - level) < 0.02) return prev;
      return { ...prev, [id]: level };
    });
  }, []);

  const activeSpeakerId = useActiveSpeaker(audioLevels);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const myId = (user?._id || user?.id)?.toString();
  const myName = user?.firstName ? `${user.firstName} ${user.lastName}` : 'You';

  const fetchParticipantNames = useCallback(async () => {
    try {
      const res = await api.get(`/meetings/${meetingId}`);
      const attendees = res.data.meeting?.attendees || [];
      const nameMap = {};
      attendees.forEach(a => {
        const u = a.user;
        if (u?._id) {
          nameMap[u._id.toString()] = { fullName: `${u.firstName} ${u.lastName}`, role: u.role };
        }
      });
      setParticipantNames(nameMap);
    } catch (e) {
      console.warn('Could not fetch participant names');
    }
  }, [meetingId]);

  const getParticipantName = useCallback((userId) => {
    if (!userId) return 'Participant';
    const id = userId.toString();
    if (id === myId) return myName;
    return participantNames[id]?.fullName || 'Participant';
  }, [participantNames, myId, myName]);

  const setLocalVideoRef = useCallback((el) => {
    localVideoRef.current = el;
    if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
  }, []);

  useEffect(() => {
    const onChange = () => setIsNativeFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleFullscreen = useCallback((userId) => {
    if (fullscreenUserId === userId && isNativeFullscreen) {
      document.exitFullscreen().catch(() => { });
      setFullscreenUserId(null);
    } else {
      setFullscreenUserId(userId);
      setTimeout(() => {
        if (fullscreenContainerRef.current) {
          fullscreenContainerRef.current.requestFullscreen().catch(err =>
            console.warn('Native fullscreen failed:', err.message)
          );
        }
      }, 50);
    }
  }, [fullscreenUserId, isNativeFullscreen]);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    setFullscreenUserId(null);
  }, []);

  const startMyRecording = useCallback((stream) => {
    if (!stream || myRecorderRef.current) return;
    try {
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(audioOnly, { mimeType });
      myChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) myChunksRef.current.push(e.data); };
      chunkIntervalRef.current = setInterval(() => {
        if (myChunksRef.current.length === 0) return;
        const blob = new Blob([...myChunksRef.current], { type: mimeType });
        myChunksRef.current = [];
        blob.arrayBuffer().then(buffer => {
          if (socketRef.current) socketRef.current.emit('audio-chunk', { meetingId, audioChunk: buffer, timestamp: Date.now() });
        }).catch(e => console.warn('Chunk send failed:', e));
      }, 10000);
      recorder.start(100);
      setTimeout(() => recorder.requestData(), 200);
      myRecorderRef.current = recorder;
      setIsMyRecording(true);
    } catch (e) {
      console.warn('Per-device recording failed:', e.message);
    }
  }, [meetingId]);

  const stopMyRecording = useCallback(() => {
    if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null; }
    if (myChunksRef.current.length > 0 && myRecorderRef.current) {
      const mimeType = myRecorderRef.current.mimeType || 'audio/webm';
      const blob = new Blob([...myChunksRef.current], { type: mimeType });
      myChunksRef.current = [];
      blob.arrayBuffer().then(buffer => {
        if (socketRef.current) socketRef.current.emit('audio-chunk', { meetingId, audioChunk: buffer, timestamp: Date.now() });
      }).catch(() => { });
    }
    if (myRecorderRef.current && myRecorderRef.current.state !== 'inactive') myRecorderRef.current.stop();
    myRecorderRef.current = null;
    setIsMyRecording(false);
  }, [meetingId]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        await fetchParticipantNames();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: true });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        socketRef.current = getSocket();
        try {
          const joinRes = await api.post(`/meetings/${meetingId}/join`);
          const mtg = joinRes.data.meeting;
          const hostId = (mtg?.host?._id || mtg?.host)?.toString();
          if (mounted) setIsHost(hostId === myId);
        } catch (e) { console.warn('Join API:', e.message); }

        socketRef.current.on('participant-names', (nameMap) => {
          if (!mounted) return;
          setParticipantNames(prev => {
            const merged = { ...prev };
            Object.entries(nameMap).forEach(([uid, name]) => {
              if (!merged[uid]) merged[uid] = { fullName: name };
              else merged[uid].fullName = name;
            });
            return merged;
          });
        });
        socketRef.current.on('participant-joined', ({ userId, displayName }) => {
          if (!mounted) return;
          setParticipantNames(prev => ({ ...prev, [userId]: { ...prev[userId], fullName: displayName } }));
        });
        socketRef.current.on('existing-users', (users) => {
          if (!mounted) return;
          users.forEach(({ userId }) => { if (!userId || userId?.toString() === myId) return; createPeer(userId, true, stream); });
        });
        socketRef.current.on('user-connected', (userId) => {
          if (!mounted) return;
          if (!userId || userId?.toString() === myId) return;
          toast.success(`${getParticipantName(userId)} joined`);
          fetchParticipantNames();
          if (!peersRef.current[userId]) createPeer(userId, false, stream);
        });
        socketRef.current.on('user-disconnected', (userId) => {
          if (!mounted) return;
          destroyPeer(userId);
          toast(`${getParticipantName(userId)} left`, { icon: '👋' });
        });
        socketRef.current.on('offer', ({ offer, userId }) => {
          if (!mounted) return;
          if (peersRef.current[userId]) peersRef.current[userId].signal(offer);
          else createPeer(userId, false, stream, offer);
        });
        socketRef.current.on('answer', ({ answer, userId }) => { if (peersRef.current[userId]) peersRef.current[userId].signal(answer); });
        socketRef.current.on('ice-candidate', ({ candidate, userId }) => { if (peersRef.current[userId]) peersRef.current[userId].signal(candidate); });
        socketRef.current.on('peer-restart', ({ userId: restartUserId }) => { if (!mounted) return; destroyPeer(restartUserId); });
        socketRef.current.on('chat-message', ({ userId, message, timestamp, userName }) => {
          if (!mounted) return;
          if (userId?.toString() === myId) return;
          const senderName = userName || getParticipantName(userId);
          setMessages(prev => [...prev, { id: Date.now() + Math.random(), userId: userId?.toString(), userName: senderName, message, timestamp, isOwn: false }]);
          setChatOpen(prev => { if (!prev) { setUnreadCount(c => c + 1); toast(`💬 ${senderName}: ${message.substring(0, 40)}`, { duration: 3000, style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' } }); } return prev; });
        });
        socketRef.current.on('hand-raised', ({ userId }) => { if (!mounted) return; setRaisedHands(prev => new Set([...prev, userId?.toString()])); if (userId?.toString() !== myId) toast(`✋ ${getParticipantName(userId)} raised hand`, { duration: 3000 }); });
        socketRef.current.on('hand-lowered', ({ userId }) => { if (!mounted) return; setRaisedHands(prev => { const n = new Set(prev); n.delete(userId?.toString()); return n; }); });
        socketRef.current.on('recording-started', () => { setIsRecording(true); if (mounted && localStreamRef.current) startMyRecording(localStreamRef.current); });
        socketRef.current.on('recording-stopped', () => { setIsRecording(false); stopMyRecording(); });
        socketRef.current.on('meeting-ended', () => { toast.success('Meeting ended by host'); stopMyRecording(); cleanup(); router.push(`/meetings/${meetingId}`); });
        socketRef.current.on('meeting-cancelled', ({ message }) => { setMeetingCancelled(true); toast.error(message || 'Meeting has been cancelled by the host'); stopMyRecording(); cleanup(); setTimeout(() => router.push('/meetings/history'), 2000); });

        joinRoom(meetingId, myId);
        if (mounted) setIsConnecting(false);
      } catch (error) {
        console.error('Init error:', error);
        if (mounted) {
          if (error.name === 'NotAllowedError') toast.error('Camera/microphone access denied.');
          else toast.error('Failed to initialize meeting room.');
          setIsConnecting(false);
        }
      }
    };
    init();
    return () => { mounted = false; stopMyRecording(); cleanup(); };
  }, [meetingId, myId]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (chatOpen) setUnreadCount(0); }, [chatOpen]);

  const createPeer = (userId, initiator, stream, incomingOffer = null) => {
    if (peersRef.current[userId]) { try { peersRef.current[userId].destroy(); } catch (e) { } delete peersRef.current[userId]; }
    const peer = new SimplePeer({
      initiator, trickle: true, stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'turn:autorack.proxy.rlwy.net:26677', username: 'catalyst', credential: 'catalyst123' },
          { urls: 'turn:autorack.proxy.rlwy.net:26677?transport=tcp', username: 'catalyst', credential: 'catalyst123' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
      }
    });
    peer.on('signal', (data) => {
      if (!socketRef.current) return;
      if (data.type === 'offer') socketRef.current.emit('offer', { meetingId, offer: data, targetUserId: userId });
      else if (data.type === 'answer') socketRef.current.emit('answer', { meetingId, answer: data, targetUserId: userId });
      else if (data.candidate) socketRef.current.emit('ice-candidate', { meetingId, candidate: data, targetUserId: userId });
    });
    peer.on('stream', (remoteStream) => { setRemoteStreams(prev => ({ ...prev, [userId]: remoteStream })); });
    peer.on('close', () => destroyPeer(userId));
    peer.on('error', (err) => {
      console.warn(`Peer error with ${userId}:`, err.message);
      if (err.message.includes('Connection failed') && localStreamRef.current) {
        setTimeout(() => { socketRef.current?.emit('peer-restart', { meetingId, targetUserId: userId }); destroyPeer(userId); createPeer(userId, true, localStreamRef.current); }, 3000);
      }
      setRemoteStreams(prev => { const n = { ...prev }; delete n[userId]; return n; });
    });
    if (incomingOffer) peer.signal(incomingOffer);
    peersRef.current[userId] = peer;
  };

  const destroyPeer = (userId) => {
    if (peersRef.current[userId]) { try { peersRef.current[userId].destroy(); } catch (e) { } delete peersRef.current[userId]; }
    setRemoteStreams(prev => { const n = { ...prev }; delete n[userId]; return n; });
    setPinnedUserId(prev => prev === userId ? null : prev);
    setAudioLevels(prev => { const n = { ...prev }; delete n[userId]; return n; });
  };

  const cleanup = () => {
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    Object.keys(peersRef.current).forEach(destroyPeer);
    try { leaveRoom(meetingId, myId); api.post(`/meetings/${meetingId}/leave`).catch(() => { }); } catch (e) { }
  };

  const toggleAudio = () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !isAudioEnabled; }); setIsAudioEnabled(p => !p); };
  const toggleVideo = () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !isVideoEnabled; }); setIsVideoEnabled(p => !p); };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        Object.values(peersRef.current).forEach(peer => { try { const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video'); if (sender) sender.replaceTrack(screenTrack); } catch (e) { } });
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => stopScreenShare();
        setIsScreenSharing(true);
      } else { stopScreenShare(); }
    } catch (e) { if (e.name !== 'NotAllowedError') toast.error('Screen sharing failed'); setIsScreenSharing(false); }
  };

  const stopScreenShare = () => {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) { Object.values(peersRef.current).forEach(peer => { try { const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video'); if (sender) sender.replaceTrack(cameraTrack); } catch (e) { } }); }
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    setIsScreenSharing(false);
  };

  const toggleHand = () => {
    if (!socketRef.current) return;
    if (isHandRaised) { socketRef.current.emit('lower-hand', { meetingId }); setRaisedHands(prev => { const n = new Set(prev); n.delete(myId); return n; }); }
    else { socketRef.current.emit('raise-hand', { meetingId }); setRaisedHands(prev => new Set([...prev, myId])); }
    setIsHandRaised(p => !p);
  };

  const startRecording = () => {
    if (!localStreamRef.current) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const destination = audioContext.createMediaStreamDestination();
      const localSource = audioContext.createMediaStreamSource(localStreamRef.current);
      localSource.connect(destination);
      Object.entries(remoteStreams).forEach(([uid, remoteStream]) => {
        if (remoteStream && remoteStream.getAudioTracks().length > 0) {
          try { const remoteSource = audioContext.createMediaStreamSource(remoteStream); remoteSource.connect(destination); } catch (e) { console.warn('Could not add remote audio for ' + uid + ':', e.message); }
        }
      });
      const mixedStream = destination.stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(mixedStream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        try {
          toast.loading('Processing per-device audio...', { id: 'upload' });
          const perDeviceAudio = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve([]), 15000);
            socketRef.current?.once('transcript-queue', ({ perDeviceAudio: pda }) => { clearTimeout(timeout); resolve(pda || []); });
            stopMyRecording();
            socketRef.current?.emit('get-transcript-queue', { meetingId });
          });
          const fd = new FormData();
          fd.append('recording', blob, 'meeting-recording.webm');
          if (perDeviceAudio.length > 0) fd.append('perDeviceAudio', JSON.stringify(perDeviceAudio));
          toast.loading('Uploading recording for AI processing...', { id: 'upload' });
          await api.post(`/meetings/${meetingId}/upload-recording`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          const method = perDeviceAudio.length > 0 ? `Per-device audio from ${perDeviceAudio.length} participants — accurate speaker attribution!` : 'Mixed audio uploaded — AI will identify speakers.';
          toast.success(method, { id: 'upload', duration: 5000 });
        } catch (e) { toast.error('Failed to upload recording', { id: 'upload' }); }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      socketRef.current?.emit('start-recording', { meetingId });
      setIsRecording(true);
      toast.success('Recording started');
    } catch (e) { toast.error('Could not start recording: ' + e.message); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    socketRef.current?.emit('stop-recording', { meetingId });
    setIsRecording(false);
    toast.success('Recording stopped — uploading...');
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || !socketRef.current) return;
    setMessages(prev => [...prev, { id: Date.now(), userId: myId, userName: myName, message, timestamp: new Date().toISOString(), isOwn: true }]);
    socketRef.current.emit('chat-message', { meetingId, message });
    setChatInput('');
  };

  const leaveMeeting = () => { stopMyRecording(); cleanup(); router.push('/meetings/history'); };

  const handleEndMeeting = async () => {
    if (!isHost) return;
    setIsEndingMeeting(true);
    try {
      await api.post(`/meetings/${meetingId}/end`);
      if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        toast.loading('Saving recording...', { id: 'end-meeting' });
        mediaRecorderRef.current.stop();
        socketRef.current?.emit('stop-recording', { meetingId });
        setIsRecording(false);
        await new Promise(resolve => setTimeout(resolve, 8000));
        toast.dismiss('end-meeting');
      } else { stopMyRecording(); }
      toast.success('Meeting ended');
      cleanup();
      router.push(`/meetings/${meetingId}`);
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to end meeting'); setIsEndingMeeting(false); }
  };

  if (meetingCancelled) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <X className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-200">Meeting Cancelled</h2>
          <p className="text-slate-400">This meeting has been cancelled by the host.</p>
          <p className="text-slate-500 text-sm">Redirecting to meetings...</p>
        </div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <div className="animate-spin h-14 w-14 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-300 font-medium">Setting up your camera and microphone...</p>
          <p className="text-slate-500 text-sm">Please allow camera and microphone access when prompted</p>
        </div>
      </div>
    );
  }

  const remoteEntries = Object.entries(remoteStreams);
  const totalParticipants = remoteEntries.length + 1;

  // ── Active speaker layout ────────────────────────────────────────────────
  // When someone is speaking and no tile is pinned, zoom them to large
  // and shrink everyone else — exactly like Google Meet's spotlight mode.
  // We only activate this when there are 2+ participants to avoid
  // pointlessly zooming a solo local tile.
  const shouldZoom = !pinnedUserId && totalParticipants > 1 && activeSpeakerId !== null;
  const zoomedId = shouldZoom ? activeSpeakerId : null;

  const ControlsBar = () => (
    <div className="bg-slate-900/95 backdrop-blur border-t border-slate-800 px-4 py-3 shrink-0">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <CtrlBtn onClick={toggleAudio} label={isAudioEnabled ? 'Mute' : 'Unmute'} danger={!isAudioEnabled}>
          {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </CtrlBtn>
        <CtrlBtn onClick={toggleVideo} label={isVideoEnabled ? 'Stop Video' : 'Start Video'} danger={!isVideoEnabled}>
          {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </CtrlBtn>
        {!isMobile && (
          <CtrlBtn onClick={toggleScreenShare} label={isScreenSharing ? 'Stop Share' : 'Share'} highlight={isScreenSharing}>
            {isScreenSharing ? <StopCircle className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
          </CtrlBtn>
        )}
        <CtrlBtn onClick={toggleHand} label={isHandRaised ? 'Lower Hand' : 'Raise Hand'} warn={isHandRaised}>
          <Hand className="h-5 w-5" />
        </CtrlBtn>
        {isHost && (
          <CtrlBtn onClick={isRecording ? stopRecording : startRecording} label={isRecording ? 'Stop Rec' : 'Record'} danger={isRecording}>
            <Circle className={cn('h-5 w-5', isRecording && 'fill-current')} />
          </CtrlBtn>
        )}
        {isHost && (
          <div className="flex flex-col items-center gap-1">
            <button onClick={handleEndMeeting} disabled={isEndingMeeting}
              className="h-12 w-12 rounded-full bg-red-700 hover:bg-red-800 disabled:opacity-50 flex items-center justify-center transition-colors">
              <StopCircle className="h-5 w-5 text-white" />
            </button>
            <span className="text-xs text-slate-500">End</span>
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <button onClick={leaveMeeting} className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors">
            <Phone className="h-5 w-5 text-white rotate-[135deg]" />
          </button>
          <span className="text-xs text-slate-500">Leave</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">

      {fullscreenUserId && (
        <div ref={fullscreenContainerRef} className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex-1 min-h-0">
            {fullscreenUserId === 'local' ? (
              <LocalTile
                videoRef={setLocalVideoRef} name={myName} isHost={isHost}
                isAudioEnabled={isAudioEnabled} isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing} isHandRaised={raisedHands.has(myId)}
                isPinned={false} onPin={() => { }} onFullscreen={exitFullscreen}
                isFullscreen large stream={localStreamRef.current}
                isActiveSpeaker={activeSpeakerId === myId}
                onAudioLevel={(lvl) => updateAudioLevel(myId, lvl)}
                audioEnabled={isAudioEnabled}
              />
            ) : (
              <RemoteTile
                userId={fullscreenUserId} stream={remoteStreams[fullscreenUserId]}
                name={getParticipantName(fullscreenUserId)}
                isHandRaised={raisedHands.has(fullscreenUserId)}
                isPinned={false} onPin={() => { }} onFullscreen={exitFullscreen}
                isFullscreen large
                isActiveSpeaker={activeSpeakerId === fullscreenUserId}
                onAudioLevel={(lvl) => updateAudioLevel(fullscreenUserId, lvl)}
              />
            )}
          </div>
          <ControlsBar />
        </div>
      )}

      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-slate-100">Meeting Room</h1>
          {isRecording && (
            <Badge className="bg-red-500/20 text-red-400 flex items-center gap-1.5 animate-pulse">
              <Circle className="h-2 w-2 fill-red-400" />Recording
            </Badge>
          )}
          {raisedHands.size > 0 && <Badge className="bg-yellow-500/20 text-yellow-400">✋ {raisedHands.size}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 text-sm">
            <Users className="h-4 w-4" /><span>{totalParticipants}</span>
          </div>
          <button onClick={() => setChatOpen(p => !p)}
            className={cn('relative p-2 rounded-lg transition-colors', chatOpen ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800')}>
            <MessageSquare className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {isRecording && !isHost && (
        <div className="bg-red-900/30 border-b border-red-800/50 px-4 py-2 text-center text-sm text-red-300 shrink-0">
          🔴 This meeting is being recorded
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className={cn('flex-1 min-w-0 p-3 overflow-hidden transition-all duration-200', chatOpen && 'mr-80')}>

          {/* ── Pinned layout (unchanged) ── */}
          {pinnedUserId ? (
            <div className="flex flex-col gap-3 h-full">
              <div className="flex-1 min-h-0">
                {pinnedUserId === 'local' ? (
                  <LocalTile
                    videoRef={setLocalVideoRef} name={myName} isHost={isHost}
                    isAudioEnabled={isAudioEnabled} isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing} isHandRaised={raisedHands.has(myId)}
                    isPinned onPin={() => setPinnedUserId(null)}
                    onFullscreen={() => handleFullscreen('local')} large
                    stream={localStreamRef.current}
                    isActiveSpeaker={activeSpeakerId === myId}
                    onAudioLevel={(lvl) => updateAudioLevel(myId, lvl)}
                    audioEnabled={isAudioEnabled}
                  />
                ) : (
                  <RemoteTile
                    userId={pinnedUserId} stream={remoteStreams[pinnedUserId]}
                    name={getParticipantName(pinnedUserId)}
                    isHandRaised={raisedHands.has(pinnedUserId)}
                    isPinned onPin={() => setPinnedUserId(null)}
                    onFullscreen={() => handleFullscreen(pinnedUserId)} large
                    isActiveSpeaker={activeSpeakerId === pinnedUserId}
                    onAudioLevel={(lvl) => updateAudioLevel(pinnedUserId, lvl)}
                  />
                )}
              </div>
              <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
                {pinnedUserId !== 'local' && (
                  <LocalTile
                    videoRef={setLocalVideoRef} name="You" isHost={isHost}
                    isAudioEnabled={isAudioEnabled} isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing} isHandRaised={raisedHands.has(myId)}
                    isPinned={false} onPin={() => setPinnedUserId('local')}
                    onFullscreen={() => handleFullscreen('local')} thumbnail
                    stream={localStreamRef.current}
                    isActiveSpeaker={activeSpeakerId === myId}
                    onAudioLevel={(lvl) => updateAudioLevel(myId, lvl)}
                    audioEnabled={isAudioEnabled}
                  />
                )}
                {remoteEntries.filter(([uid]) => uid !== pinnedUserId).map(([uid, stream]) => (
                  <RemoteTile key={uid} userId={uid} stream={stream}
                    name={getParticipantName(uid)} isHandRaised={raisedHands.has(uid)}
                    isPinned={false} onPin={() => setPinnedUserId(uid)}
                    onFullscreen={() => handleFullscreen(uid)} thumbnail
                    isActiveSpeaker={activeSpeakerId === uid}
                    onAudioLevel={(lvl) => updateAudioLevel(uid, lvl)}
                  />
                ))}
              </div>
            </div>

          /* ── Active-speaker zoom layout ── */
          ) : zoomedId ? (
            <div className="flex flex-col gap-2 h-full">
              {/* Zoomed speaker — takes ~75% of vertical space */}
              <div className="flex-1 min-h-0">
                {zoomedId === myId ? (
                  <LocalTile
                    videoRef={setLocalVideoRef} name={myName} isHost={isHost}
                    isAudioEnabled={isAudioEnabled} isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing} isHandRaised={raisedHands.has(myId)}
                    isPinned={false} onPin={() => setPinnedUserId('local')}
                    onFullscreen={() => handleFullscreen('local')} large
                    stream={localStreamRef.current}
                    isActiveSpeaker={true}
                    onAudioLevel={(lvl) => updateAudioLevel(myId, lvl)}
                    audioEnabled={isAudioEnabled}
                    audioLevel={audioLevels[myId] || 0}
                  />
                ) : (
                  <RemoteTile
                    userId={zoomedId} stream={remoteStreams[zoomedId]}
                    name={getParticipantName(zoomedId)}
                    isHandRaised={raisedHands.has(zoomedId)}
                    isPinned={false} onPin={() => setPinnedUserId(zoomedId)}
                    onFullscreen={() => handleFullscreen(zoomedId)} large
                    isActiveSpeaker={true}
                    onAudioLevel={(lvl) => updateAudioLevel(zoomedId, lvl)}
                    audioLevel={audioLevels[zoomedId] || 0}
                  />
                )}
              </div>
              {/* Thumbnails strip for non-speaking participants */}
              <div className="flex gap-2 h-28 shrink-0 overflow-x-auto pb-1">
                {zoomedId !== myId && (
                  <LocalTile
                    videoRef={setLocalVideoRef} name="You" isHost={isHost}
                    isAudioEnabled={isAudioEnabled} isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing} isHandRaised={raisedHands.has(myId)}
                    isPinned={false} onPin={() => setPinnedUserId('local')}
                    onFullscreen={() => handleFullscreen('local')} thumbnail
                    stream={localStreamRef.current}
                    isActiveSpeaker={activeSpeakerId === myId}
                    onAudioLevel={(lvl) => updateAudioLevel(myId, lvl)}
                    audioEnabled={isAudioEnabled}
                    audioLevel={audioLevels[myId] || 0}
                  />
                )}
                {remoteEntries.filter(([uid]) => uid !== zoomedId).map(([uid, stream]) => (
                  <RemoteTile key={uid} userId={uid} stream={stream}
                    name={getParticipantName(uid)} isHandRaised={raisedHands.has(uid)}
                    isPinned={false} onPin={() => setPinnedUserId(uid)}
                    onFullscreen={() => handleFullscreen(uid)} thumbnail
                    isActiveSpeaker={activeSpeakerId === uid}
                    onAudioLevel={(lvl) => updateAudioLevel(uid, lvl)}
                    audioLevel={audioLevels[uid] || 0}
                  />
                ))}
              </div>
            </div>

          /* ── Default grid layout ── */
          ) : (
            <div className={cn(
              'grid gap-2 h-full',
              totalParticipants === 1 ? 'grid-cols-1 grid-rows-1' :
                totalParticipants === 2 ? 'grid-cols-2 grid-rows-1' :
                  totalParticipants === 3 ? 'grid-cols-2 grid-rows-2' :
                    totalParticipants === 4 ? 'grid-cols-2 grid-rows-2' :
                      totalParticipants <= 6 ? 'grid-cols-3 grid-rows-2' :
                        totalParticipants <= 9 ? 'grid-cols-3 grid-rows-3' : 'grid-cols-4'
            )}>
              <LocalTile
                videoRef={setLocalVideoRef} name={myName} isHost={isHost}
                isAudioEnabled={isAudioEnabled} isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing} isHandRaised={raisedHands.has(myId)}
                isPinned={pinnedUserId === 'local'} onPin={() => setPinnedUserId('local')}
                onFullscreen={() => handleFullscreen('local')}
                spanFull={totalParticipants === 3}
                stream={localStreamRef.current}
                isActiveSpeaker={activeSpeakerId === myId}
                onAudioLevel={(lvl) => updateAudioLevel(myId, lvl)}
                audioEnabled={isAudioEnabled}
                audioLevel={audioLevels[myId] || 0}
              />
              {remoteEntries.map(([uid, stream]) => (
                <RemoteTile key={uid} userId={uid} stream={stream}
                  name={getParticipantName(uid)} isHandRaised={raisedHands.has(uid)}
                  isPinned={pinnedUserId === uid}
                  onPin={() => setPinnedUserId(p => p === uid ? null : uid)}
                  onFullscreen={() => handleFullscreen(uid)}
                  isActiveSpeaker={activeSpeakerId === uid}
                  onAudioLevel={(lvl) => updateAudioLevel(uid, lvl)}
                  audioLevel={audioLevels[uid] || 0}
                />
              ))}
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <span className="font-semibold text-slate-200">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-slate-500 text-center text-sm mt-12">No messages yet 👋</p>
              ) : messages.map(msg => (
                <div key={msg.id} className={cn('flex flex-col gap-0.5', msg.isOwn ? 'items-end' : 'items-start')}>
                  <span className="text-xs text-slate-500 px-1">{msg.userName}</span>
                  <span className={cn('inline-block px-3 py-2 rounded-2xl text-sm max-w-[220px] break-words', msg.isOwn ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm')}>
                    {msg.message}
                  </span>
                  <span className="text-xs text-slate-600 px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-3 border-t border-slate-800 flex gap-2 shrink-0">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              <button type="submit" disabled={!chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-sm transition-colors">Send</button>
            </form>
          </div>
        )}
      </div>

      <ControlsBar />
    </div>
  );
}

// ── SpeakerRing ────────────────────────────────────────────────────────────
// The animated outline that pulses with the speaker's audio amplitude.
// Rendered as an absolutely-positioned ring around the tile — separate from
// the video element so it never clips the video feed.
//
// Design decisions:
// - Uses CSS box-shadow instead of border so the ring grows outward without
//   shifting the tile layout.
// - Three layers of shadow: inner tight ring (always visible when active),
//   mid glow (scales with volume), outer bloom (only on loud peaks).
// - Colour: green (#22c55e) matches Google Meet's active-speaker indicator.
// - Transition: 80ms — fast enough to feel responsive but not jittery.
function SpeakerRing({ isActive, level = 0, thumbnail = false }) {
  if (!isActive) return null;

  // Scale the glow radius and opacity with the audio level
  const mid = Math.round(4 + level * 12);   // 4px quiet → 16px loud
  const outer = Math.round(level * 20);      // 0px quiet → 20px loud
  const opacity = (0.5 + level * 0.5).toFixed(2); // 0.5 → 1.0

  const ringStyle = {
    position: 'absolute',
    inset: 0,
    borderRadius: thumbnail ? '0.5rem' : '0.75rem',
    // Three-layer box-shadow for the pulsing effect:
    // 1. Tight ring — always visible, marks the speaker clearly
    // 2. Mid glow  — expands with volume
    // 3. Outer bloom — only appears on loud speech
    boxShadow: [
      `inset 0 0 0 2px rgba(34, 197, 94, ${opacity})`,
      `0 0 ${mid}px rgba(34, 197, 94, 0.6)`,
      outer > 4 ? `0 0 ${outer}px rgba(34, 197, 94, 0.25)` : null,
    ].filter(Boolean).join(', '),
    transition: 'box-shadow 80ms ease-out',
    pointerEvents: 'none', // never intercepts clicks meant for the tile
    zIndex: 10,
  };

  return <div style={ringStyle} aria-hidden="true" />;
}

// ── LocalTile ──────────────────────────────────────────────────────────────
// Pulls its own audio level via useAudioLevel so the ring is self-contained.
// The local stream is passed in as a prop (not the videoRef) purely for
// audio analysis — the video element keeps its own ref.
function LocalTile({ videoRef, name, isHost, isAudioEnabled, isVideoEnabled,
  isScreenSharing, isHandRaised, isPinned, onPin, onFullscreen,
  large, thumbnail, isFullscreen, spanFull,
  stream, isActiveSpeaker, onAudioLevel, audioEnabled, audioLevel }) {

  // Analyse local audio only when mic is on
  const level = useAudioLevel(stream, audioEnabled !== false);

  // Report level upward so the parent can run active-speaker detection
  useEffect(() => {
    onAudioLevel?.(level);
  }, [level, onAudioLevel]);

  return (
    <div className={cn(
      'relative bg-slate-800 rounded-xl overflow-hidden group',
      large ? 'w-full h-full' : thumbnail ? 'w-40 h-28 shrink-0' : 'w-full h-full',
      spanFull && 'col-span-2',
      // CSS transition on transform lets the zoom feel smooth
      'transition-transform duration-500 ease-in-out',
    )}>
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

      {/* Active-speaker ring — sits on top of the video */}
      <SpeakerRing isActive={isActiveSpeaker} level={audioLevel ?? level} thumbnail={thumbnail} />

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-1">
        <TileBtn onClick={onPin} title={isPinned ? 'Unpin' : 'Pin'}>
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </TileBtn>
        <TileBtn onClick={onFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </TileBtn>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        <span className="text-white text-xs font-medium truncate">
          {name}{isHost ? ' · Host' : ''}{isScreenSharing ? ' · Screen' : ''}
        </span>
        {isHandRaised && <span>✋</span>}
        {!isAudioEnabled && <MicOff className="h-3 w-3 text-red-400 ml-auto shrink-0" />}
      </div>
    </div>
  );
}

// ── RemoteTile ─────────────────────────────────────────────────────────────
function RemoteTile({ userId, stream, name, isHandRaised, isPinned,
  onPin, onFullscreen, large, thumbnail, isFullscreen, spanFull,
  isActiveSpeaker, onAudioLevel, audioLevel }) {

  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  // Analyse remote audio from the peer's MediaStream
  const level = useAudioLevel(stream, true);

  useEffect(() => {
    onAudioLevel?.(level);
  }, [level, onAudioLevel]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      const tracks = stream.getVideoTracks();
      setHasVideo(tracks.length > 0 && tracks[0].readyState === 'live');
      stream.onaddtrack = () => {
        const vt = stream.getVideoTracks();
        setHasVideo(vt.length > 0 && vt[0].readyState === 'live');
      };
    }
  }, [stream]);

  const initials = name.split(' ').map(n => n[0] || '').join('').slice(0, 2).toUpperCase() || '??';

  return (
    <div className={cn(
      'relative bg-slate-800 rounded-xl overflow-hidden group',
      large ? 'w-full h-full' : thumbnail ? 'w-40 h-28 shrink-0' : 'w-full h-full',
      spanFull && 'col-span-2',
      'transition-transform duration-500 ease-in-out',
    )}>
      <video ref={videoRef} autoPlay playsInline
        className={cn('w-full h-full object-cover', !hasVideo && 'hidden')} />

      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <div className="w-16 h-16 rounded-full bg-slate-600 flex items-center justify-center text-xl font-bold text-slate-200">
            {initials}
          </div>
        </div>
      )}

      {/* Active-speaker ring */}
      <SpeakerRing isActive={isActiveSpeaker} level={audioLevel ?? level} thumbnail={thumbnail} />

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-1">
        <TileBtn onClick={onPin} title={isPinned ? 'Unpin' : 'Pin'}>
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </TileBtn>
        <TileBtn onClick={onFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </TileBtn>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        <span className="text-white text-xs font-medium truncate">{name}</span>
        {isHandRaised && <span>✋</span>}
      </div>
    </div>
  );
}

function TileBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-md transition-colors">
      {children}
    </button>
  );
}

function CtrlBtn({ onClick, children, label, danger, highlight, warn }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button onClick={onClick} className={cn(
        'h-12 w-12 rounded-full border flex items-center justify-center transition-colors',
        danger ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' :
          highlight ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30' :
            warn ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/30' :
              'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
      )}>
        {children}
      </button>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}