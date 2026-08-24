import dotenv from 'dotenv';
dotenv.config();

process.env.TZ = 'Asia/Ho_Chi_Minh';

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'cwh_super_secret_key_12345',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  pg: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'wp_user',
    password: process.env.PGPASSWORD || 'wp_password',
    database: process.env.PGDATABASE || 'wp',
  },
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '"CWH Jamming" <noreply@cwh.com>',
  },
};
