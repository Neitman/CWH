import { Request, Response } from 'express';
import os from 'os';
import { Server } from 'socket.io';
import redis from '../config/redis';
import { HTTP_STATUS } from '../constants/httpStatus';
import * as userModel from '../models/userModel';
import * as playlistService from '../services/playlistService';

export const getStats = async (req: Request, res: Response) => {
  try {
    let pgStatus = 'Disconnected';
    let userCount = 0;
    try {
      userCount = await userModel.getUserCount();
      pgStatus = 'Connected';
    } catch (err) {
      console.error('Admin Stats: PostgreSQL health check failed:', err);
    }

    let redisStatus = 'Disconnected';
    try {
      const pong = await redis.ping();
      if (pong === 'PONG') {
        redisStatus = 'Connected';
      }
    } catch (err) {
      console.error('Admin Stats: Redis health check failed:', err);
    }

    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const usedMem = totalMem - freeMem;
    const stats = {
      uptime: process.uptime(),
      osUptime: os.uptime(),
      memory: {
        process: process.memoryUsage(),
        system: {
          free: freeMem,
          total: totalMem,
          used: usedMem,
          usagePercentage: Math.round((usedMem / totalMem) * 100)
        }
      },
      platform: os.platform(),
      cpuCount: os.cpus().length,
      databases: {
        postgresql: pgStatus,
        redis: redisStatus
      },
      userCount
    };

    return res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error fetching statistics.' });
  }
};

export const getActiveRooms = async (req: Request, res: Response) => {
  try {
    const io = req.app.get('io') as Server | undefined;
    const keys = await redis.keys('wp:*:playlist');
    const rooms: any[] = [];

    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 3) {
        const roomId = parts[1];
        const queue = await playlistService.getPlaylistQueue(roomId);
        const { currentSong, playback } = await playlistService.getPlaybackState(roomId);

        let listenersCount = 0;
        let members: string[] = [];
        if (io) {
          const sockets = await io.in(roomId).fetchSockets();
          const rawMembers = sockets.map(s => s.data.username || `Guest ${s.id.slice(0, 4)}`);
          members = Array.from(new Set(rawMembers));
          listenersCount = members.length;
        }

        rooms.push({
          roomId,
          queueLength: queue.length,
          currentSong,
          playback: {
            isPlaying: playback.isPlaying,
            progress: Math.round(playback.progress)
          },
          listenersCount,
          members
        });
      }
    }

    return res.json(rooms);
  } catch (error) {
    console.error('Error listing active rooms:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error listing rooms.' });
  }
};

export const deleteActiveRoom = async (req: Request, res: Response) => {
  const { roomId } = req.params;
  try {
    const playlistKey = `wp:${roomId}:playlist`;
    const currentSongKey = `wp:${roomId}:current_song`;
    const playbackKey = `wp:${roomId}:playback`;
    const hostKey = `wp:${roomId}:host`;
    const permissionsKey = `wp:${roomId}:write_permissions`;

    await redis.del(playlistKey, currentSongKey, playbackKey, hostKey, permissionsKey);

    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.to(roomId).emit('room-deleted', { message: 'This room has been closed by admin.' });
      const sockets = await io.in(roomId).fetchSockets();
      sockets.forEach(s => s.leave(roomId));
    }

    return res.json({ message: `Room ${roomId} successfully deleted.` });
  } catch (error) {
    console.error(`Error deleting room ${roomId}:`, error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: `Internal server error deleting room ${roomId}.` });
  }
};

export const skipRoomSong = async (req: Request, res: Response) => {
  const { roomId } = req.params;
  try {
    const { currentSong, playback, queue } = await playlistService.playNextSong(roomId);

    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.to(roomId).emit('playlist-updated', queue);
      io.to(roomId).emit('play', {
        currentSong,
        playback: {
          isPlaying: playback.isPlaying,
          progress: playback.progress
        }
      });
    }

    return res.json({ message: 'Skipped to next song.', currentSong });
  } catch (error) {
    console.error(`Error skipping song in room ${roomId}:`, error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: `Internal server error skipping song in room ${roomId}.` });
  }
};

export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await userModel.getAllUsers();
    return res.json(users);
  } catch (error) {
    console.error('Error fetching registered users:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error fetching users list.' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid user ID' });
  }

  try {
    await userModel.deleteUserById(userId);
    return res.json({ message: `User ID ${userId} deleted successfully.` });
  } catch (error) {
    console.error(`Error deleting user ID ${userId}:`, error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: `Internal server error deleting user.` });
  }
};

export const flushRedis = async (req: Request, res: Response) => {
  try {
    const keys = await redis.keys('wp:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.emit('system-reset', { message: 'Database was flushed by administration.' });
    }

    return res.json({ message: `Redis flushed. ${keys.length} keys deleted.` });
  } catch (error) {
    console.error('Error flushing Redis:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error flushing Redis database.' });
  }
};
