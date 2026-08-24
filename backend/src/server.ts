import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { config } from './config/env';
import { initDb } from './config/db';
import { allowedOrigins } from './config/socket';
import { socketAuthMiddleware } from './sockets/socketMiddleware';
import { registerSocketHandlers } from './sockets';

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Bind io to Express app for Admin routes
app.set('io', io);

// Socket Middlewares & Event Registration
io.use(socketAuthMiddleware);
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

// Bootstrapping Server & Database
const startServer = async () => {
  try {
    await initDb();
    httpServer.listen(config.port, () => {
      console.log(`=================================================`);
      console.log(`  🚀 CWH Backend Server is running on port ${config.port}`);
      console.log(`  📊 Admin Dashboard: http://localhost:${config.port}/admin`);
      console.log(`=================================================`);
    });
  } catch (error) {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  }
};

startServer();

export { httpServer, io };
