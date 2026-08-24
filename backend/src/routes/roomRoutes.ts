import { Router } from 'express';
import * as roomController from '../controllers/roomController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', authenticateToken, roomController.createRoom);
router.get('/my-rooms', authenticateToken, roomController.getMyRooms);
router.put('/:id', authenticateToken, roomController.updateRoom);
router.delete('/:id', authenticateToken, roomController.deleteRoom);
router.get('/info/:roomId', roomController.getRoomByCode);

export default router;
