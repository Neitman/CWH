import { Router } from 'express';
import { searchYouTube, getVideoDetails } from '../controllers/searchController';

const router = Router();

router.get('/search', searchYouTube);
router.get('/video-details', getVideoDetails);

export default router;
