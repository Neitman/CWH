import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { HTTP_STATUS } from '../constants/httpStatus';

const uploadsDir = path.join(__dirname, '../../public/uploads/videos');

export const uploadVideo = (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No video file provided.' });
    }

    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const streamUrl = `/api/videos/stream/${filename}`;
    const videoId = `custom-${Date.now()}`;

    return res.json({
      id: videoId,
      title: originalName,
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
      channelTitle: `Uploaded by ${req.user?.username || 'Host'}`,
      duration: 0,
      type: 'custom',
      videoUrl: streamUrl
    });
  } catch (error) {
    console.error('Error uploading video file:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to upload video file.' });
  }
};

export const streamVideo = (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  if (!filePath.startsWith(uploadsDir)) {
    return res.status(HTTP_STATUS.FORBIDDEN).send('Access denied.');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(HTTP_STATUS.NOT_FOUND).send('Video file not found.');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

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
};
