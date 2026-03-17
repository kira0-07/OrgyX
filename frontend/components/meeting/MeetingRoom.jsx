'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SimplePeer from 'simple-peer';
import {
  Mic, MicOff, Video, VideoOff, Phone,
  MessageSquare, ScreenShare, StopCircle,
  Hand, Users, PhoneOff, Circle,
  Pin, PinOff, Maximize2, X
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSocket, joinRoom, leaveRoom } from '@/lib/socket';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

export default function MeetingRoom({ meetingId, user }) {
  const router = useRouter();
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const chatBottomRef = useRef(null);

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
          nameMap[u._id.toString()] = {
            fullName: `${u.firstName} ${u.lastName}`,
            role: u.role
          };
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
    if (id === myId) return 'You';
    return participantNames[id]?.fullName || 'Participant';
  }, [participantNames, myId]);

  // Callback ref for local video — attaches stream as soon as element mounts
  const setLocalVideoRef = useCallback((el) => {
    localVideoRef.current = el;
    if (el && localStreamRef.current) {
      el.srcObject = localStreamRef.current;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await fetchParticipantNames();

        // Get camera + mic
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: true
        });

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        localStreamRef.current = stream;

        // Attach immediately if ref already exists
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        socketRef.current = getSocket();

        try {
          const joinRes = await api.post(`/meetings/${meetingId}/join`);
          const mtg = joinRes.data.meeting;
          const hostId = (mtg?.host?._id || mtg?.host)?.toString();
          if (mounted) setIsHost(hostId === myId);
        } catch (e) {
          console.warn('Join API:', e.message);
        }

        // ── existing-users: sent to ME when I join, listing who's already in room
        // I am the INITIATOR for all existing peers
        socketRef.current.on('existing-users', (users) => {
          if (!mounted) return;
          users.forEach(({ userId }) => {
            if (!userId || userId?.toString() === myId) return;
            createPeer(userId, true, stream);
          });
        });

        // ── user-connected: a NEW person joined AFTER me
        // They will initiate the offer, so I am NOT the initiator
        // ✅ FIX: was only showing a toast — now also creates a peer to receive their offer
        socketRef.current.on('user-connected', (userId) => {
          if (!mounted) return;
          if (!userId || userId?.toString() === myId) return;
          toast.success(`${getParticipantName(userId)} joined`);
          fetchParticipantNames();
          // Create peer as non-initiator — wait for their offer to arrive
          createPeer(userId, false, stream);
        });

        socketRef.current.on('user-disconnected', (userId) => {
          if (!mounted) return;
          destroyPeer(userId);
          toast.info(`${getParticipantName(userId)} left`);
        });

        socketRef.current.on('offer', ({ offer, userId }) => {
          if (!mounted) return;
          // Signal the offer into the existing peer (created above in user-connected)
          // If peer doesn't exist yet, create it now
          if (peersRef.current[userId]) {
            peersRef.current[userId].signal(offer);
          } else {
            createPeer(userId, false, stream, offer);
          }
        });

        socketRef.current.on('answer', ({ answer, userId }) => {
          if (peersRef.current[userId]) peersRef.current[userId].signal(answer);
        });

        socketRef.current.on('ice-candidate', ({ candidate, userId }) => {
          if (peersRef.current[userId]) peersRef.current[userId].signal(candidate);
        });

        socketRef.current.on('chat-message', ({ userId, message, timestamp, userName }) => {
          if (!mounted) return;
          if (userId?.toString() === myId) return;
          const senderName = userName || getParticipantName(userId);
          setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            userId: userId?.toString(),
            userName: senderName,
            message,
            timestamp,
            isOwn: false
          }]);
          setChatOpen(prev => {
            if (!prev) {
              setUnreadCount(c => c + 1);
              toast(`💬 ${senderName}: ${message.substring(0, 40)}`, {
                duration: 3000,
                style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }
              });
            }
            return prev;
          });
        });

        socketRef.current.on('hand-raised', ({ userId }) => {
          if (!mounted) return;
          setRaisedHands(prev => new Set([...prev, userId?.toString()]));
          if (userId?.toString() !== myId) {
            toast(`✋ ${getParticipantName(userId)} raised hand`, { duration: 3000 });
          }
        });

        socketRef.current.on('hand-lowered', ({ userId }) => {
          if (!mounted) return;
          setRaisedHands(prev => { const n = new Set(prev); n.delete(userId?.toString()); return n; });
        });

        socketRef.current.on('recording-started', () => setIsRecording(true));
        socketRef.current.on('recording-stopped', () => setIsRecording(false));

        socketRef.current.on('meeting-ended', () => {
          toast.success('Meeting ended by host');
          cleanup();
          router.push(`/meetings/${meetingId}`);
        });

        socketRef.current.on('meeting-cancelled', ({ message }) => {
          setMeetingCancelled(true);
          toast.error(message || 'Meeting has been cancelled by the host');
          cleanup();
          setTimeout(() => router.push('/meetings/history'), 2000);
        });

        joinRoom(meetingId, myId);
        if (mounted) setIsConnecting(false);

      } catch (error) {
        console.error('Init error:', error);
        if (mounted) {
          if (error.name === 'NotAllowedError') {
            toast.error('Camera/microphone access denied. Please allow permissions and try again.');
          } else {
            toast.error('Failed to initialize meeting room.');
          }
          setIsConnecting(false);
        }
      }
    };

    init();
    return () => { mounted = false; cleanup(); };
  }, [meetingId, myId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  const createPeer = (userId, initiator, stream, incomingOffer = null) => {
    if (peersRef.current[userId]) {
      try { peersRef.current[userId].destroy(); } catch (e) {}
    }

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (data) => {
      if (!socketRef.current) return;
      if (data.type === 'offer') {
        socketRef.current.emit('offer', { meetingId, offer: data, targetUserId: userId });
      } else if (data.type === 'answer') {
        socketRef.current.emit('answer', { meetingId, answer: data, targetUserId: userId });
      } else if (data.candidate) {
        socketRef.current.emit('ice-candidate', { meetingId, candidate: data, targetUserId: userId });
      }
    });

    peer.on('stream', (remoteStream) => {
      setRemoteStreams(prev => ({ ...prev, [userId]: remoteStream }));
    });

    peer.on('close', () => destroyPeer(userId));
    peer.on('error', (err) => console.warn('Peer error:', err.message));

    if (incomingOffer) peer.signal(incomingOffer);
    peersRef.current[userId] = peer;
  };

  const destroyPeer = (userId) => {
    if (peersRef.current[userId]) {
      try { peersRef.current[userId].destroy(); } catch (e) {}
      delete peersRef.current[userId];
    }
    setRemoteStreams(prev => { const n = { ...prev }; delete n[userId]; return n; });
    setPinnedUserId(prev => prev === userId ? null : prev);
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    Object.keys(peersRef.current).forEach(destroyPeer);
    try {
      leaveRoom(meetingId, myId);
      api.post(`/meetings/${meetingId}/leave`).catch(() => {});
    } catch (e) {}
  };

  const toggleAudio = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !isAudioEnabled; });
    setIsAudioEnabled(p => !p);
  };

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !isVideoEnabled; });
    setIsVideoEnabled(p => !p);
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' }, audio: false
        });
        const screenTrack = screenStream.getVideoTracks()[0];

        Object.values(peersRef.current).forEach(peer => {
          try {
            const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
          } catch (e) {}
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        screenTrack.onended = () => { stopScreenShare(); };
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (e) {
      if (e.name !== 'NotAllowedError') toast.error('Screen sharing failed');
      setIsScreenSharing(false);
    }
  };

  const stopScreenShare = () => {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      Object.values(peersRef.current).forEach(peer => {
        try {
          const sender = peer._pc?.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(cameraTrack);
        } catch (e) {}
      });
    }
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    setIsScreenSharing(false);
  };

  const toggleHand = () => {
    if (!socketRef.current) return;
    if (isHandRaised) {
      socketRef.current.emit('lower-hand', { meetingId });
      setRaisedHands(prev => { const n = new Set(prev); n.delete(myId); return n; });
    } else {
      socketRef.current.emit('raise-hand', { meetingId });
      setRaisedHands(prev => new Set([...prev, myId]));
    }
    setIsHandRaised(p => !p);
  };

  const startRecording = () => {
    if (!localStreamRef.current) return;
    try {
      const audioStream = new MediaStream(localStreamRef.current.getAudioTracks());
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(audioStream, { mimeType });
      recordingChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('recording', blob, 'meeting-recording.webm');
        try {
          toast.loading('Uploading recording for AI processing...', { id: 'upload' });
          await api.post(`/meetings/${meetingId}/upload-recording`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          toast.success('Recording uploaded! AI summary will be ready shortly.', { id: 'upload' });
        } catch (e) {
          toast.error('Failed to upload recording', { id: 'upload' });
          console.error('Upload error:', e.response?.data);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      socketRef.current?.emit('start-recording', { meetingId });
      setIsRecording(true);
      toast.success('Recording started');
    } catch (e) {
      toast.error('Could not start recording: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    socketRef.current?.emit('stop-recording', { meetingId });
    setIsRecording(false);
    toast.success('Recording stopped — uploading...');
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || !socketRef.current) return;
    setMessages(prev => [...prev, {
      id: Date.now(),
      userId: myId,
      userName: 'You',
      message,
      timestamp: new Date().toISOString(),
      isOwn: true
    }]);
    socketRef.current.emit('chat-message', { meetingId, message });
    setChatInput('');
  };

  const leaveMeeting = () => {
    cleanup();
    router.push('/meetings/history');
  };

  const handleEndMeeting = async () => {
    if (!isHost) return;
    setIsEndingMeeting(true);
    try {
      await api.post(`/meetings/${meetingId}/end`);
      toast.success('Meeting ended');
      cleanup();
      router.push(`/meetings/${meetingId}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to end meeting');
      setIsEndingMeeting(false);
    }
  };

  if (meetingCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
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
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-slate-100">Meeting Room</h1>
          {isRecording && (
            <Badge className="bg-red-500/20 text-red-400 flex items-center gap-1.5 animate-pulse">
              <Circle className="h-2 w-2 fill-red-400" />
              Recording
            </Badge>
          )}
          {raisedHands.size > 0 && (
            <Badge className="bg-yellow-500/20 text-yellow-400">✋ {raisedHands.size}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 text-sm">
            <Users className="h-4 w-4" />
            <span>{totalParticipants}</span>
          </div>
          <button
            onClick={() => setChatOpen(p => !p)}
            className={cn(
              'relative p-2 rounded-lg transition-colors',
              chatOpen ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-800'
            )}
          >
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

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <div className={cn('flex-1 p-3 overflow-auto transition-all duration-200', chatOpen && 'mr-80')}>
          {pinnedUserId ? (
            <div className="flex flex-col gap-3 h-full">
              <div className="flex-1 min-h-0">
                {pinnedUserId === 'local' ? (
                  <LocalTile
                    videoRef={setLocalVideoRef}
                    name={myName}
                    isHost={isHost}
                    isAudioEnabled={isAudioEnabled}
                    isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing}
                    isHandRaised={raisedHands.has(myId)}
                    isPinned
                    onPin={() => setPinnedUserId(null)}
                    onFullscreen={() => setFullscreenUserId('local')}
                    large
                  />
                ) : (
                  <RemoteTile
                    userId={pinnedUserId}
                    stream={remoteStreams[pinnedUserId]}
                    name={getParticipantName(pinnedUserId)}
                    isHandRaised={raisedHands.has(pinnedUserId)}
                    isPinned
                    onPin={() => setPinnedUserId(null)}
                    onFullscreen={() => setFullscreenUserId(pinnedUserId)}
                    large
                  />
                )}
              </div>
              <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
                {pinnedUserId !== 'local' && (
                  <LocalTile
                    videoRef={setLocalVideoRef}
                    name="You"
                    isHost={isHost}
                    isAudioEnabled={isAudioEnabled}
                    isVideoEnabled={isVideoEnabled}
                    isScreenSharing={isScreenSharing}
                    isHandRaised={raisedHands.has(myId)}
                    isPinned={false}
                    onPin={() => setPinnedUserId('local')}
                    onFullscreen={() => setFullscreenUserId('local')}
                    thumbnail
                  />
                )}
                {remoteEntries.filter(([uid]) => uid !== pinnedUserId).map(([uid, stream]) => (
                  <RemoteTile key={uid} userId={uid} stream={stream}
                    name={getParticipantName(uid)}
                    isHandRaised={raisedHands.has(uid)}
                    isPinned={false}
                    onPin={() => setPinnedUserId(uid)}
                    onFullscreen={() => setFullscreenUserId(uid)}
                    thumbnail
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className={cn(
              'grid gap-3 h-full',
              totalParticipants === 1 ? 'grid-cols-1' :
              totalParticipants === 2 ? 'grid-cols-2' :
              totalParticipants <= 4 ? 'grid-cols-2' :
              totalParticipants <= 6 ? 'grid-cols-3' : 'grid-cols-4'
            )}>
              <LocalTile
                videoRef={setLocalVideoRef}
                name={myName}
                isHost={isHost}
                isAudioEnabled={isAudioEnabled}
                isVideoEnabled={isVideoEnabled}
                isScreenSharing={isScreenSharing}
                isHandRaised={raisedHands.has(myId)}
                isPinned={pinnedUserId === 'local'}
                onPin={() => setPinnedUserId('local')}
                onFullscreen={() => setFullscreenUserId('local')}
              />
              {remoteEntries.map(([uid, stream]) => (
                <RemoteTile key={uid} userId={uid} stream={stream}
                  name={getParticipantName(uid)}
                  isHandRaised={raisedHands.has(uid)}
                  isPinned={pinnedUserId === uid}
                  onPin={() => setPinnedUserId(p => p === uid ? null : uid)}
                  onFullscreen={() => setFullscreenUserId(uid)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        {chatOpen && (
          <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col fixed right-0 top-[57px] bottom-[88px] z-10">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-slate-200">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-slate-500 text-center text-sm mt-12">No messages yet 👋</p>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={cn('flex flex-col gap-0.5', msg.isOwn ? 'items-end' : 'items-start')}>
                    <span className="text-xs text-slate-500 px-1">{msg.userName}</span>
                    <span className={cn(
                      'inline-block px-3 py-2 rounded-2xl text-sm max-w-[220px] break-words',
                      msg.isOwn ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                    )}>
                      {msg.message}
                    </span>
                    <span className="text-xs text-slate-600 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-sm transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-3 shrink-0">
        <div className="flex items-center justify-center gap-2">
          <CtrlBtn onClick={toggleAudio} label={isAudioEnabled ? 'Mute' : 'Unmute'} danger={!isAudioEnabled}>
            {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn onClick={toggleVideo} label={isVideoEnabled ? 'Stop Video' : 'Start Video'} danger={!isVideoEnabled}>
            {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn onClick={toggleScreenShare} label={isScreenSharing ? 'Stop Share' : 'Share'} highlight={isScreenSharing}>
            {isScreenSharing ? <StopCircle className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn onClick={toggleHand} label={isHandRaised ? 'Lower Hand' : 'Raise Hand'} warn={isHandRaised}>
            <Hand className="h-5 w-5" />
          </CtrlBtn>
          {isHost && (
            <CtrlBtn
              onClick={isRecording ? stopRecording : startRecording}
              label={isRecording ? 'Stop Rec' : 'Record'}
              danger={isRecording}
            >
              <Circle className={cn('h-5 w-5', isRecording && 'fill-current')} />
            </CtrlBtn>
          )}
          {isHost && (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={handleEndMeeting}
                disabled={isEndingMeeting}
                className="h-12 w-12 rounded-full bg-red-700 hover:bg-red-800 disabled:opacity-50 flex items-center justify-center transition-colors"
              >
                <StopCircle className="h-5 w-5 text-white" />
              </button>
              <span className="text-xs text-slate-500">End</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={leaveMeeting}
              className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
            >
              <Phone className="h-5 w-5 text-white rotate-[135deg]" />
            </button>
            <span className="text-xs text-slate-500">Leave</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Local video tile ──
function LocalTile({ videoRef, name, isHost, isAudioEnabled, isVideoEnabled,
  isScreenSharing, isHandRaised, isPinned, onPin, onFullscreen, large, thumbnail }) {
  return (
    <div className={cn(
      'relative bg-slate-800 rounded-xl overflow-hidden group',
      large ? 'w-full h-full' : thumbnail ? 'w-40 h-28 shrink-0' : 'aspect-video'
    )}>
      <video
        ref={videoRef}
        autoPlay muted playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-1">
        <TileBtn onClick={onPin} title={isPinned ? 'Unpin' : 'Pin'}>
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </TileBtn>
        <TileBtn onClick={onFullscreen} title="Fullscreen">
          <Maximize2 className="h-3.5 w-3.5" />
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

// ── Remote video tile ──
function RemoteTile({ userId, stream, name, isHandRaised, isPinned,
  onPin, onFullscreen, large, thumbnail }) {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

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

  return (
    <div className={cn(
      'relative bg-slate-800 rounded-xl overflow-hidden group',
      large ? 'w-full h-full' : thumbnail ? 'w-40 h-28 shrink-0' : 'aspect-video'
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
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-1">
        <TileBtn onClick={onPin} title={isPinned ? 'Unpin' : 'Pin'}>
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </TileBtn>
        <TileBtn onClick={onFullscreen} title="Fullscreen">
          <Maximize2 className="h-3.5 w-3.5" />
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