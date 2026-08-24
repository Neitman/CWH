import { Server, Socket } from 'socket.io';
import * as playlistService from '../services/playlistService';

export const registerPlaybackHandlers = (io: Server, socket: Socket, roomId: string) => {
  const playNextSong = async () => {
    try {
      const { currentSong, playback, queue } = await playlistService.playNextSong(roomId);
      
      io.to(roomId).emit('playlist-updated', queue);
      io.to(roomId).emit('play', {
        currentSong,
        playback: {
          isPlaying: playback.isPlaying,
          progress: playback.progress
        }
      });
      if (currentSong) {
        console.log(`[Room ${roomId}] Playing next video: "${currentSong.title}"`);
      } else {
        console.log(`[Room ${roomId}] Playlist ended, no more videos to play`);
      }
    } catch (error) {
      console.error('Error playing next video:', error);
    }
  };

  socket.on('add-song', async (songData: Omit<playlistService.Song, 'addedBy'>) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to add videos to the room queue.' });
      return;
    }

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const canWrite = await playlistService.hasWritePermission(roomId, userIdentifier);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    try {
      const song: playlistService.Song = {
        ...songData,
        addedBy: socket.data.username
      };
      
      const playlist = await playlistService.addSongToQueue(roomId, song);
      io.to(roomId).emit('playlist-updated', playlist);
      console.log(`[Room ${roomId}] Video added to queue: "${song.title}" by ${socket.data.username}`);

      const { currentSong } = await playlistService.getPlaybackState(roomId);
      if (!currentSong) {
        await playNextSong();
      }
    } catch (error) {
      console.error('Error adding video to playlist:', error);
    }
  });

  socket.on('add-songs', async (songsData: Omit<playlistService.Song, 'addedBy'>[]) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to add videos.' });
      return;
    }

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const canWrite = await playlistService.hasWritePermission(roomId, userIdentifier);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    if (!Array.isArray(songsData) || songsData.length === 0) return;

    try {
      const songs: playlistService.Song[] = songsData.map(s => ({
        ...s,
        addedBy: socket.data.username
      }));
      
      const playlist = await playlistService.addSongsToQueue(roomId, songs);
      io.to(roomId).emit('playlist-updated', playlist);
      console.log(`[Room ${roomId}] Added ${songs.length} videos to queue by ${socket.data.username}`);

      const { currentSong } = await playlistService.getPlaybackState(roomId);
      if (!currentSong) {
        await playNextSong();
      }
    } catch (error) {
      console.error('Error adding batch videos to playlist:', error);
    }
  });

  socket.on('remove-song', async (songId: string) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to remove videos.' });
      return;
    }

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const canWrite = await playlistService.hasWritePermission(roomId, userIdentifier);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    try {
      const updatedQueue = await playlistService.removeSongFromQueue(roomId, songId);
      io.to(roomId).emit('playlist-updated', updatedQueue);
      console.log(`[Room ${roomId}] Video removed from queue ID: ${songId} by ${socket.data.username}`);
    } catch (error) {
      console.error('Error removing video:', error);
    }
  });

  socket.on('set-playback', async (state: { isPlaying: boolean; progress: number }) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to control playback.' });
      return;
    }

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const canWrite = await playlistService.hasWritePermission(roomId, userIdentifier);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    try {
      const playback = await playlistService.setPlaybackState(roomId, state.isPlaying, state.progress);
      
      socket.to(roomId).emit('playback-updated', {
        isPlaying: playback.isPlaying,
        progress: playback.progress
      });
      
      console.log(`[Room ${roomId}] Playback state updated by ${socket.data.username}: isPlaying=${playback.isPlaying}, progress=${playback.progress}s`);
    } catch (error) {
      console.error('Error setting playback state:', error);
    }
  });

  socket.on('next-song', async () => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to skip videos.' });
      return;
    }

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const canWrite = await playlistService.hasWritePermission(roomId, userIdentifier);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    await playNextSong();
  });
};
