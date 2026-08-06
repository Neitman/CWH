import { Router, Response } from 'express';
import { query } from '../db';
import { AuthRequest } from '../middleware/authMiddleware';

const router = Router();

// 1. Get all playlists for logged-in user with item counts
router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await query(
      `SELECT p.id, p.title, p.description, p.created_at, p.updated_at,
              COUNT(i.id)::int as song_count
       FROM user_playlists p
       LEFT JOIN user_playlist_items i ON p.id = i.playlist_id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [userId]
    );

    return res.json({ playlists: result.rows });
  } catch (error) {
    console.error('Error fetching user playlists:', error);
    return res.status(500).json({ error: 'Failed to fetch playlists.' });
  }
});

// 2. Create a new playlist
router.post('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, description } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Playlist title is required.' });
  }

  try {
    const result = await query(
      `INSERT INTO user_playlists (user_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING id, title, description, created_at, updated_at`,
      [userId, title.trim(), description ? description.trim() : '']
    );

    return res.status(201).json({
      message: 'Playlist created successfully!',
      playlist: { ...result.rows[0], song_count: 0 }
    });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return res.status(500).json({ error: 'Failed to create playlist.' });
  }
});

// 3. Get playlist details and all items
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  try {
    const playlistResult = await query(
      `SELECT * FROM user_playlists WHERE id = $1 AND user_id = $2`,
      [playlistId, userId]
    );

    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied.' });
    }

    const itemsResult = await query(
      `SELECT id, song_id as "songId", title, thumbnail, channel_title as "channelTitle", duration, position, added_at
       FROM user_playlist_items
       WHERE playlist_id = $1
       ORDER BY position ASC, added_at ASC`,
      [playlistId]
    );

    return res.json({
      playlist: playlistResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching playlist details:', error);
    return res.status(500).json({ error: 'Failed to fetch playlist details.' });
  }
});

// 4. Delete playlist
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  try {
    const result = await query(
      `DELETE FROM user_playlists WHERE id = $1 AND user_id = $2 RETURNING id`,
      [playlistId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied.' });
    }

    return res.json({ message: 'Playlist deleted successfully.', id: playlistId });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return res.status(500).json({ error: 'Failed to delete playlist.' });
  }
});

// 5. Add song to user playlist
router.post('/:id/items', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const { id: songId, title, thumbnail, channelTitle, duration } = req.body;
  if (!songId || !title) {
    return res.status(400).json({ error: 'Song ID and Title are required.' });
  }

  try {
    // Check ownership
    const playlistCheck = await query(
      `SELECT id FROM user_playlists WHERE id = $1 AND user_id = $2`,
      [playlistId, userId]
    );

    if (playlistCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied.' });
    }

    // Insert song item into playlist
    const insertResult = await query(
      `INSERT INTO user_playlist_items (playlist_id, song_id, title, thumbnail, channel_title, duration, position)
       VALUES ($1, $2, $3, $4, $5, $6, (
         SELECT COALESCE(MAX(position), 0) + 1 FROM user_playlist_items WHERE playlist_id = $1
       ))
       RETURNING id, song_id as "songId", title, thumbnail, channel_title as "channelTitle", duration, position, added_at`,
      [playlistId, songId, title, thumbnail || '', channelTitle || '', duration || 0]
    );

    // Update playlist updated_at timestamp
    await query(`UPDATE user_playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [playlistId]);

    return res.status(201).json({
      message: 'Song added to playlist!',
      item: insertResult.rows[0]
    });
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    return res.status(500).json({ error: 'Failed to add song to playlist.' });
  }
});

// 6. Remove song item from user playlist
router.delete('/:id/items/:itemId', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id);
  const itemId = parseInt(req.params.itemId);

  if (isNaN(playlistId) || isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid playlist or item ID.' });
  }

  try {
    // Check ownership of playlist
    const playlistCheck = await query(
      `SELECT id FROM user_playlists WHERE id = $1 AND user_id = $2`,
      [playlistId, userId]
    );

    if (playlistCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied.' });
    }

    // Delete item
    const deleteResult = await query(
      `DELETE FROM user_playlist_items WHERE id = $1 AND playlist_id = $2 RETURNING id`,
      [itemId, playlistId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Song item not found in playlist.' });
    }

    return res.json({ message: 'Song removed from playlist.', itemId });
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    return res.status(500).json({ error: 'Failed to remove song from playlist.' });
  }
});

export default router;
