import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  let token = socket.handshake.auth?.token;
  if (!token && socket.handshake.headers?.authorization) {
    const authHeader = socket.handshake.headers.authorization as string;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { id: number; username: string; displayName?: string };
      socket.data.username = decoded.displayName || decoded.username;
      socket.data.rawUsername = decoded.username;
      socket.data.userId = decoded.id;
    } catch (err) {
      socket.data.username = `User_${Math.floor(1000 + Math.random() * 9000)}`;
      socket.data.rawUsername = socket.data.username;
      socket.data.userId = 0;
    }
  } else {
    socket.data.username = `User_${Math.floor(1000 + Math.random() * 9000)}`;
    socket.data.userId = 0;
  }

  const roomId = socket.handshake.auth?.roomId || 'lobby';
  socket.data.roomId = roomId;

  next();
};
