import { Router } from 'express';
import * as playlistController from '../controllers/playlistController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', playlistController.getUserPlaylists);
router.post('/', playlistController.createPlaylist);
router.get('/:id', playlistController.getPlaylistDetails);
router.post('/:id/items', playlistController.addSongToPlaylist);
router.delete('/:id/items/:itemId', playlistController.deleteSongFromPlaylist);
router.delete('/:id', playlistController.deletePlaylist);

export default router;
