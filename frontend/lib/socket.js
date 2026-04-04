import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "https://orgyx-backend.onrender.com";

let socket = null;

export const getSocket = () => {
  if (!socket) {
    const token = localStorage.getItem('accessToken');
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinRoom = (meetingId, userId) => {
  const s = getSocket();
  s.emit('join-room', { meetingId, userId });
};

export const leaveRoom = (meetingId, userId) => {
  const s = getSocket();
  s.emit('leave-room', { meetingId, userId });
};

export const sendMessage = (meetingId, message) => {
  const s = getSocket();
  s.emit('chat-message', { meetingId, message });
};

export const raiseHand = (meetingId) => {
  const s = getSocket();
  s.emit('raise-hand', { meetingId });
};

export const lowerHand = (meetingId) => {
  const s = getSocket();
  s.emit('lower-hand', { meetingId });
};

export const startRecording = (meetingId) => {
  const s = getSocket();
  s.emit('start-recording', { meetingId });
};

export const stopRecording = (meetingId) => {
  const s = getSocket();
  s.emit('stop-recording', { meetingId });
};

export default {
  getSocket,
  disconnectSocket,
  joinRoom,
  leaveRoom,
  sendMessage,
  raiseHand,
  lowerHand,
  startRecording,
  stopRecording,
};