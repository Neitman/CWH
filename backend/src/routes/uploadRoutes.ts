import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// Ensure upload directory exists
const uploadsDir = path.join(__dirname, '../../public/uploads/videos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Periodic cleanup: delete orphaned video files older than 6 hours
setInterval(() => {
  try {
    if (!fs.existsSync(uploadsDir)) return;
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    const SIX_HOURS = 6 * 3600 * 1000;

    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > SIX_HOURS) {
        fs.unlinkSync(filePath);
        console.log(`[Scheduled Cleanup] Removed old video file: ${file}`);
      }
    });
  } catch (err) {
    console.error('[Scheduled Cleanup] Error cleaning old video files:', err);
  }
}, 60 * 60 * 1000);

// Multer Storage Setup
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
    cb(null, `video-${uniqueSuffix}-${baseName}${ext}`);
  }
});

// File filter for video formats
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.ogv'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext) || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid video format. Allowed formats: MP4, WebM, MKV, AVI, MOV, M4V, OGV.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB max file size
  }
});

/**
 * POST /api/videos/upload
 * Allows room host or users with write access to upload a custom video file
 */
router.post('/upload', authenticateToken, upload.single('video'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const streamUrl = `/api/videos/stream/${filename}`;
    const videoId = `custom-${Date.now()}`;

    return res.json({
      id: videoId,
      title: originalName,
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
      channelTitle: `Uploaded by ${(req as any).user?.username || 'Host'}`,
      duration: 0, // HTML5 video player will determine duration on metadata loaded
      type: 'custom',
      videoUrl: streamUrl
    });
  } catch (error) {
    console.error('Error uploading video file:', error);
    return res.status(500).json({ error: 'Failed to upload video file.' });
  }
});

/**
 * GET /api/videos/stream/:filename
 * Streaming route supporting HTTP Range Requests (206 Partial Content) for smooth seeking
 */
router.get('/stream/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  // Security check to prevent directory traversal
  if (!filePath.startsWith(uploadsDir)) {
    return res.status(403).send('Access denied.');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video file not found.');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Determine Content-Type based on file extension
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.ogv') contentType = 'video/ogg';
  else if (ext === '.mov') contentType = 'video/quicktime';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send(`Requested range not satisfiable\n${start} >= ${fileSize}`);
      return;
    }

    const chunkSize = (end - start) + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
    });

    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

export default router;
