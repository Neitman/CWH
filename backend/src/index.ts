import dotenv from 'dotenv';
dotenv.config();

process.env.TZ = 'Asia/Ho_Chi_Minh';

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import searchRoutes from './routes/searchRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import userPlaylistRoutes from './routes/userPlaylistRoutes';
import roomRoutes from './routes/roomRoutes';
import uploadRoutes from './routes/uploadRoutes';
import { authenticateToken } from './middleware/authMiddleware';
import { registerStudyHandlers } from './sockets/studyHandler';
import { initDb } from './db';
import path from 'path';

const allowedOrigins = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) return callback(null, true);

  const envOrigins = process.env.CORS_ORIGIN
    ? (process.env.CORS_ORIGIN.includes(',') 
        ? process.env.CORS_ORIGIN.split(',') 
        : [process.env.CORS_ORIGIN])
    : [];

  const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allAllowed = [...envOrigins, ...defaultOrigins];

  const isAllowed = allAllowed.includes('*') || 
                    allAllowed.includes(origin) || 
                    origin.endsWith('.ngrok-free.app') || 
                    origin.endsWith('.ngrok.io');

  if (isAllowed) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/playlists', authenticateToken, userPlaylistRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/videos', uploadRoutes);
app.use('/api', authenticateToken, searchRoutes);

// Serve Uploaded Avatars and Videos Static Files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Serve Admin Dashboard Static Files
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Bind io to express app for admin route scanning
app.set('io', io);

// Socket.io JWT authentication and Room middleware
io.use((socket, next) => {
  let token = socket.handshake.auth?.token;
  if (!token && socket.handshake.headers?.authorization) {
    const authHeader = socket.handshake.headers.authorization as string;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  const JWT_SECRET = process.env.JWT_SECRET || 'wp_super_secret_key_12345';
  
  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string; displayName?: string };
      socket.data.username = decoded.displayName || decoded.username;
      socket.data.userId = decoded.id;
    } catch (err) {
      socket.data.username = `User_${Math.floor(1000 + Math.random() * 9000)}`;
      socket.data.userId = 0;
    }
  } else {
    socket.data.username = `User_${Math.floor(1000 + Math.random() * 9000)}`;
    socket.data.userId = 0;
  }
  
  // Set room ID
  const roomId = socket.handshake.auth?.roomId || 'lobby';
  socket.data.roomId = roomId;
  
  next();
});

// Register WebSockets event handlers
io.on('connection', (socket) => {
  const roomId = socket.data.roomId || 'lobby';
  socket.join(roomId);
  registerStudyHandlers(io, socket, roomId);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, async () => {
  await initDb();
  console.log(`Server running on port ${PORT}`);
});

