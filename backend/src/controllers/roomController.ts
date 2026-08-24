import { Request, Response } from 'express';
import { HTTP_STATUS } from '../constants/httpStatus';
import * as roomService from '../services/roomService';

export const createRoom = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized. Please log in.' });
    }

    const { name, description, customRoomId } = req.body;
    const newRoom = await roomService.createRoom(
      req.user.id,
      name,
      description,
      customRoomId
    );

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Room created successfully!',
      room: newRoom
    });
  } catch (error: any) {
    console.error('Error creating room:', error);
    if (error.code === '23505') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'A room with this code already exists. Please choose another code.' });
    }
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create room.' });
  }
};

export const getMyRooms = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized. Please log in.' });
    }

    const rooms = await roomService.getUserRooms(req.user.id);
    return res.json({ rooms });
  } catch (error) {
    console.error('Error fetching user rooms:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch rooms.' });
  }
};

export const updateRoom = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized. Please log in.' });
    }

    const roomIdNum = parseInt(req.params.id, 10);
    if (isNaN(roomIdNum)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid room ID.' });
    }

    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Room name is required.' });
    }

    const updatedRoom = await roomService.updateRoom(req.user.id, roomIdNum, name, description);
    if (!updatedRoom) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Room not found or permission denied.' });
    }

    return res.json({
      message: 'Room updated successfully!',
      room: updatedRoom
    });
  } catch (error) {
    console.error('Error updating room:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update room.' });
  }
};

export const deleteRoom = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized. Please log in.' });
    }

    const roomIdNum = parseInt(req.params.id, 10);
    if (isNaN(roomIdNum)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid room ID.' });
    }

    const success = await roomService.deleteRoom(req.user.id, roomIdNum);
    if (!success) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Room not found or permission denied.' });
    }

    return res.json({ message: 'Room deleted successfully!' });
  } catch (error) {
    console.error('Error deleting room:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete room.' });
  }
};

export const getRoomByCode = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await roomService.getRoomByCode(roomId);
    if (!room) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Room not found.' });
    }
    return res.json({ room });
  } catch (error) {
    console.error('Error fetching room info:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch room details.' });
  }
};
