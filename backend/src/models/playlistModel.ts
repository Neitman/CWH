import { query } from '../config/db';
import { UserPlaylist, UserPlaylistItem } from '../types/playlist';

export const createPlaylist = async (userId: number, title: string, description?: string): Promise<UserPlaylist> => {
  const res = await query(
    'INSERT INTO user_playlists (user_id, title, description) VALUES ($1, $2, $3) RETURNING *',
    [userId, title, description || null]
  );
  return res.rows[0];
};

export const getUserPlaylists = async (userId: number): Promise<UserPlaylist[]> => {
  const sql = `
    SELECT p.*, COUNT(pi.id)::int as item_count
    FROM user_playlists p
    LEFT JOIN user_playlist_items pi ON p.id = pi.playlist_id
    WHERE p.user_id = $1
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `;
  const res = await query(sql, [userId]);
  return res.rows;
};

export const getPlaylistById = async (playlistId: number, userId: number): Promise<UserPlaylist | null> => {
  const res = await query('SELECT * FROM user_playlists WHERE id = $1 AND user_id = $2', [playlistId, userId]);
  return res.rows[0] || null;
};

export const getPlaylistItems = async (playlistId: number): Promise<UserPlaylistItem[]> => {
  const res = await query('SELECT * FROM user_playlist_items WHERE playlist_id = $1 ORDER BY position ASC, id ASC', [playlistId]);
  return res.rows;
};

export const addPlaylistItem = async (
  playlistId: number,
  songId: string,
  title: string,
  thumbnail?: string,
  channelTitle?: string,
  duration?: number
): Promise<UserPlaylistItem> => {
  const posRes = await query('SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM user_playlist_items WHERE playlist_id = $1', [playlistId]);
  const nextPos = posRes.rows[0].next_pos;

  const res = await query(
    'INSERT INTO user_playlist_items (playlist_id, song_id, title, thumbnail, channel_title, duration, position) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [playlistId, songId, title, thumbnail || null, channelTitle || null, duration || 0, nextPos]
  );

  await query('UPDATE user_playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [playlistId]);
  return res.rows[0];
};

export const deletePlaylistItem = async (itemId: number, playlistId: number): Promise<void> => {
  await query('DELETE FROM user_playlist_items WHERE id = $1 AND playlist_id = $2', [itemId, playlistId]);
  await query('UPDATE user_playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [playlistId]);
};

export const deletePlaylist = async (playlistId: number, userId: number): Promise<boolean> => {
  const res = await query('DELETE FROM user_playlists WHERE id = $1 AND user_id = $2 RETURNING id', [playlistId, userId]);
  return (res.rowCount ?? 0) > 0;
};
