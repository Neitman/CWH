import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import searchRoutes from './routes/searchRoutes';
import { registerMusicHandlers } from './sockets/musicHandler';

const allowedOrigins = process.env.CORS_ORIGIN
  ? (process.env.CORS_ORIGIN.includes(',') 
      ? process.env.CORS_ORIGIN.split(',') 
      : [process.env.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'])
  : '*';

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Register API Routes
app.use('/api', searchRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Register WebSockets event handlers
io.on('connection', (socket) => {
  registerMusicHandlers(io, socket);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
