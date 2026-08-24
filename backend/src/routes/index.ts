import { Router } from 'express';
import authRoutes from './authRoutes';
import roomRoutes from './roomRoutes';
import userPlaylistRoutes from './userPlaylistRoutes';
import uploadRoutes from './uploadRoutes';
import searchRoutes from './searchRoutes';
import adminRoutes from './adminRoutes';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/playlists', authenticateToken, userPlaylistRoutes);
router.use('/rooms', roomRoutes);
router.use('/videos', uploadRoutes);
router.use('/', authenticateToken, searchRoutes);

export default router;
