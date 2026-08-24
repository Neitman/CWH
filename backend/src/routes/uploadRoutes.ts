import { Router } from 'express';
import * as uploadController from '../controllers/uploadController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { uploadVideoMiddleware } from '../middlewares/uploadMiddleware';

const router = Router();

router.post('/upload', authenticateToken, uploadVideoMiddleware.single('video'), uploadController.uploadVideo);
router.get('/stream/:filename', uploadController.streamVideo);

export default router;
