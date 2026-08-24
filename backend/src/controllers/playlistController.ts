import { Request, Response } from 'express';
import { HTTP_STATUS } from '../constants/httpStatus';
import * as playlistModel from '../models/playlistModel';

export const getUserPlaylists = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });

  try {
    const playlists = await playlistModel.getUserPlaylists(userId);
    return res.json({ playlists });
  } catch (error) {
    console.error('Error fetching user playlists:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch playlists.' });
  }
};

export const createPlaylist = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });

  const { title, description } = req.body;
  if (!title || !title.trim()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Playlist title is required.' });
  }

  try {
    const playlist = await playlistModel.createPlaylist(userId, title.trim(), description?.trim());
    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Playlist created successfully!',
      playlist: { ...playlist, song_count: 0 }
    });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create playlist.' });
  }
};

export const getPlaylistDetails = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid playlist ID.' });

  try {
    const playlist = await playlistModel.getPlaylistById(playlistId, userId);
    if (!playlist) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Playlist not found.' });

    const items = await playlistModel.getPlaylistItems(playlistId);
    return res.json({ playlist, items });
  } catch (error) {
    console.error('Error fetching playlist details:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch playlist details.' });
  }
};

export const addSongToPlaylist = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid playlist ID.' });

  const { songId, title, thumbnail, channelTitle, duration } = req.body;
  if (!songId || !title) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Song ID and title are required.' });
  }

  try {
    const playlist = await playlistModel.getPlaylistById(playlistId, userId);
    if (!playlist) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Playlist not found or access denied.' });

    const item = await playlistModel.addPlaylistItem(
      playlistId,
      songId,
      title,
      thumbnail,
      channelTitle,
      duration
    );

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Song added to playlist successfully!',
      item
    });
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to add song to playlist.' });
  }
};

export const deleteSongFromPlaylist = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);

  if (isNaN(playlistId) || isNaN(itemId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid playlist or item ID.' });
  }

  try {
    const playlist = await playlistModel.getPlaylistById(playlistId, userId);
    if (!playlist) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Playlist not found or access denied.' });

    await playlistModel.deletePlaylistItem(itemId, playlistId);
    return res.json({ message: 'Song removed from playlist.' });
  } catch (error) {
    console.error('Error removing song from playlist:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to remove song.' });
  }
};

export const deletePlaylist = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Unauthorized' });

  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid playlist ID.' });

  try {
    const success = await playlistModel.deletePlaylist(playlistId, userId);
    if (!success) return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Playlist not found or access denied.' });

    return res.json({ message: 'Playlist deleted successfully.' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete playlist.' });
  }
};
