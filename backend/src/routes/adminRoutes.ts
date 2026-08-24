import { Router } from 'express';
import * as adminController from '../controllers/adminController';

const router = Router();

router.get('/stats', adminController.getStats);
router.get('/rooms', adminController.getActiveRooms);
router.delete('/rooms/:roomId', adminController.deleteActiveRoom);
router.post('/rooms/:roomId/next', adminController.skipRoomSong);
router.get('/users', adminController.getUsers);
router.delete('/users/:id', adminController.deleteUser);
router.post('/redis/flush', adminController.flushRedis);

export default router;
