import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import * as roomService from '../services/roomService';

const router = Router();

// POST /api/rooms - Create a persistent room
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const { name, description, customRoomId } = req.body;
    const newRoom = await roomService.createRoom(
      req.user.id,
      name,
      description,
      customRoomId
    );

    return res.status(201).json({
      message: 'Room created successfully!',
      room: newRoom
    });
  } catch (error: any) {
    console.error('Error creating room:', error);
    if (error.code === '23505') { // Unique constraint violation in Postgres
      return res.status(400).json({ error: 'A room with this code already exists. Please choose another code.' });
    }
    return res.status(500).json({ error: 'Failed to create room.' });
  }
});

// GET /api/rooms/my-rooms - Fetch rooms created by logged in user
router.get('/my-rooms', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const rooms = await roomService.getUserRooms(req.user.id);
    return res.json({ rooms });
  } catch (error) {
    console.error('Error fetching user rooms:', error);
    return res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// PUT /api/rooms/:id - Update room details (Name & Description)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const roomIdNum = parseInt(req.params.id, 10);
    if (isNaN(roomIdNum)) {
      return res.status(400).json({ error: 'Invalid room ID.' });
    }

    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Room name is required.' });
    }

    const updatedRoom = await roomService.updateRoom(req.user.id, roomIdNum, name, description);
    if (!updatedRoom) {
      return res.status(404).json({ error: 'Room not found or permission denied.' });
    }

    return res.json({
      message: 'Room updated successfully!',
      room: updatedRoom
    });
  } catch (error) {
    console.error('Error updating room:', error);
    return res.status(500).json({ error: 'Failed to update room.' });
  }
});

// DELETE /api/rooms/:id - Delete a room owned by user
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const roomIdNum = parseInt(req.params.id, 10);
    if (isNaN(roomIdNum)) {
      return res.status(400).json({ error: 'Invalid room ID.' });
    }

    const success = await roomService.deleteRoom(req.user.id, roomIdNum);
    if (!success) {
      return res.status(404).json({ error: 'Room not found or permission denied.' });
    }

    return res.json({ message: 'Room deleted successfully!' });
  } catch (error) {
    console.error('Error deleting room:', error);
    return res.status(500).json({ error: 'Failed to delete room.' });
  }
});

// GET /api/rooms/info/:roomId - Get public info for a room code
router.get('/info/:roomId', async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await roomService.getRoomByCode(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }
    return res.json({ room });
  } catch (error) {
    console.error('Error fetching room info:', error);
    return res.status(500).json({ error: 'Failed to fetch room details.' });
  }
});

export default router;
