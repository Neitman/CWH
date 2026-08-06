import { Router, Request, Response } from 'express';
import os from 'os';
import { Server } from 'socket.io';
import redis from '../config/redis';
import { query } from '../db';
import * as playlistService from '../services/playlistService';

const router = Router();

// 1. GET /stats - Server hardware & database connection stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Check PostgreSQL
    let pgStatus = 'Disconnected';
    let userCount = 0;
    try {
      const pgRes = await query('SELECT COUNT(*) FROM users');
      pgStatus = 'Connected';
      userCount = parseInt(pgRes.rows[0].count || '0', 10);
    } catch (err) {
      console.error('Admin Stats: PostgreSQL health check failed:', err);
    }

    // Check Redis
    let redisStatus = 'Disconnected';
    try {
      const pong = await redis.ping();
      if (pong === 'PONG') {
        redisStatus = 'Connected';
      }
    } catch (err) {
      console.error('Admin Stats: Redis health check failed:', err);
    }

    // Server Info
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

    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Internal server error fetching statistics.' });
  }
});

// 2. GET /rooms - List active rooms scanned from Redis keys
router.get('/rooms', async (req: Request, res: Response) => {
  try {
    const io = req.app.get('io') as Server | undefined;
    
    // Find all playlist keys in Redis (cwh:*:playlist)
    const keys = await redis.keys('cwh:*:playlist');
    const rooms: any[] = [];

    for (const key of keys) {
      // Key format: cwh:room-xxxxxx:playlist
      const parts = key.split(':');
      if (parts.length >= 3) {
        const roomId = parts[1];
        
        // Fetch room info from Redis
        const queue = await playlistService.getPlaylistQueue(roomId);
        const { currentSong, playback } = await playlistService.getPlaybackState(roomId);
        
        // Fetch active socket count from Socket.io namespace
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

    res.json(rooms);
  } catch (error) {
    console.error('Error listing active rooms:', error);
    res.status(500).json({ error: 'Internal server error listing rooms.' });
  }
});

// 3. DELETE /rooms/:roomId - Clears the Redis storage of a room and kicks listeners
router.delete('/rooms/:roomId', async (req: Request, res: Response) => {
  const { roomId } = req.params;
  try {
    // Delete Redis keys
    const playlistKey = `cwh:${roomId}:playlist`;
    const currentSongKey = `cwh:${roomId}:current_song`;
    const playbackKey = `cwh:${roomId}:playback`;
    const hostKey = `cwh:${roomId}:host`;
    const permissionsKey = `cwh:${roomId}:write_permissions`;

    await redis.del(playlistKey, currentSongKey, playbackKey, hostKey, permissionsKey);

    // Notify connected sockets in the room and kick them out
    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.to(roomId).emit('room-deleted', { message: 'This room has been closed by admin.' });
      
      const sockets = await io.in(roomId).fetchSockets();
      sockets.forEach(s => s.leave(roomId));
    }

    res.json({ message: `Room ${roomId} successfully deleted.` });
  } catch (error) {
    console.error(`Error deleting room ${roomId}:`, error);
    res.status(500).json({ error: `Internal server error deleting room ${roomId}.` });
  }
});

// 4. POST /rooms/:roomId/next - Force skip current song in a room
router.post('/rooms/:roomId/next', async (req: Request, res: Response) => {
  const { roomId } = req.params;
  try {
    const { currentSong, playback, queue } = await playlistService.playNextSong(roomId);
    
    // Broadcast skips to all clients in the room
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

    res.json({ message: 'Skipped to next song.', currentSong });
  } catch (error) {
    console.error(`Error skipping song in room ${roomId}:`, error);
    res.status(500).json({ error: `Internal server error skipping song in room ${roomId}.` });
  }
});

// 5. GET /users - List all registered user accounts
router.get('/users', async (req: Request, res: Response) => {
  try {
    const dbRes = await query('SELECT id, username, created_at FROM users ORDER BY id DESC');
    res.json(dbRes.rows);
  } catch (error) {
    console.error('Error fetching registered users:', error);
    res.status(500).json({ error: 'Internal server error fetching users list.' });
  }
});

// 6. DELETE /users/:id - Delete a user account from PostgreSQL
router.delete('/users/:id', async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: `User ID ${userId} deleted successfully.` });
  } catch (error) {
    console.error(`Error deleting user ID ${userId}:`, error);
    res.status(500).json({ error: `Internal server error deleting user.` });
  }
});

// 7. POST /redis/flush - Clear all Redis cache starting with cwh:
router.post('/redis/flush', async (req: Request, res: Response) => {
  try {
    const keys = await redis.keys('cwh:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    
    // Notify all connected sockets of cache reset
    const io = req.app.get('io') as Server | undefined;
    if (io) {
      io.emit('system-reset', { message: 'Database was flushed by administration.' });
    }

    res.json({ message: `Redis flushed. ${keys.length} keys deleted.` });
  } catch (error) {
    console.error('Error flushing Redis:', error);
    res.status(500).json({ error: 'Internal server error flushing Redis database.' });
  }
});

export default router;
