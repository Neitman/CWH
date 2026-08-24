import './types/express';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { allowedOrigins } from './config/socket';
import masterRouter from './routes';
import { notFoundHandler, globalErrorHandler } from './middlewares/errorMiddleware';

const app = express();

// Core Middlewares
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Root Health Check Route
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    message: 'CWH Backend API is running smoothly (Refactored Clean Architecture)',
    adminDashboard: '/admin'
  });
});

// Master API Routes Registration
app.use('/api', masterRouter);

// Serve Uploaded Files & Avatars
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Serve Admin Dashboard Static Interface
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// 404 & Global Error Middlewares
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
