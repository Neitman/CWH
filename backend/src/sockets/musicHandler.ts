import { Server, Socket } from 'socket.io';
import * as playlistService from '../services/playlistService';

export const registerMusicHandlers = (io: Server, socket: Socket, roomId: string) => {
  const clientName = socket.data.username || `Guest ${socket.id.slice(0, 4)}`;
  console.log(`Client connected to music room: ${clientName} (Socket: ${socket.id}) in Room: ${roomId}`);
  
  // Helper to emit updated members list of this room
  const emitRoomMembers = async () => {
    try {
      const sockets = await io.in(roomId).fetchSockets();
      const rawMembers = sockets.map(s => s.data.username || `Guest ${s.id.slice(0, 4)}`);
      const uniqueMembers = Array.from(new Set(rawMembers));
      
      const host = await playlistService.getRoomHost(roomId);
      
      const membersData = await Promise.all(uniqueMembers.map(async (username) => {
        const isHost = username === host;
        const canWrite = isHost || (await playlistService.hasWritePermission(roomId, username));
        return {
          username,
          isHost,
          canWrite
        };
      }));

      io.to(roomId).emit('room-members-updated', {
        members: membersData,
        count: uniqueMembers.length
      });
    } catch (err) {
      console.error('Error fetching room members:', err);
    }
  };

  // Auto-register host if not set and broadcast roster
  (async () => {
    try {
      await playlistService.setRoomHost(roomId, socket.data.username);
    } catch (err) {
      console.error('Error auto-setting host on connect:', err);
    }
    await emitRoomMembers();
  })();

  // Sync state with newly connected client
  (async () => {
    try {
      const playlist = await playlistService.getPlaylistQueue(roomId);
      const { currentSong, playback } = await playlistService.getPlaybackState(roomId);
      
      socket.emit('sync-state', {
        playlist,
        currentSong,
        playback: {
          isPlaying: playback.isPlaying,
          progress: playback.progress
        }
      });
    } catch (error) {
      console.error('Error syncing connection state:', error);
    }
  })();

  // Helper to handle skip/pop to next song
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
        console.log(`[Room ${roomId}] Playing next song: "${currentSong.title}"`);
      } else {
        console.log(`[Room ${roomId}] Playlist ended, no more songs to play`);
      }
    } catch (error) {
      console.error('Error playing next song:', error);
    }
  };

  // Handle adding a song to playlist queue
  socket.on('add-song', async (songData: Omit<playlistService.Song, 'addedBy'>) => {
    if (!socket.data.userId) {
      socket.emit('auth-error', { error: 'Please log in to add songs to the playlist.' });
      return;
    }
    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'Permission denied. You do not have write access in this room.' });
      return;
    }

    try {
      const song: playlistService.Song = {
        ...songData,
        addedBy: socket.data.username
      };
      
      const playlist = await playlistService.addSongToQueue(roomId, song);
      io.to(roomId).emit('playlist-updated', playlist);
      console.log(`[Room ${roomId}] Song added to queue: "${song.title}" by ${socket.data.username}`);

      // Auto play if no song is currently playing
      const { currentSong } = await playlistService.getPlaybackState(roomId);
      if (!currentSong) {
        await playNextSong();
      }
    } catch (error) {
      console.error('Error adding song to playlist:', error);
    }
  });

  // Handle removing a song from queue
  socket.on('remove-song', async (songId: string) => {
    if (!socket.data.userId) {
      socket.emit('auth-error', { error: 'Please log in to remove songs.' });
      return;
    }
    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'Permission denied. You do not have write access in this room.' });
      return;
    }

    try {
      const updatedQueue = await playlistService.removeSongFromQueue(roomId, songId);
      io.to(roomId).emit('playlist-updated', updatedQueue);
      console.log(`[Room ${roomId}] Song removed from queue ID: ${songId} by ${socket.data.username}`);
    } catch (error) {
      console.error('Error removing song:', error);
    }
  });

  // Handle manual playback actions (play, pause, seek)
  socket.on('set-playback', async (state: { isPlaying: boolean; progress: number }) => {
    if (!socket.data.userId) {
      socket.emit('auth-error', { error: 'Please log in to control playback.' });
      return;
    }
    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'Permission denied. You do not have write access in this room.' });
      return;
    }

    try {
      const playback = await playlistService.setPlaybackState(roomId, state.isPlaying, state.progress);
      
      // Broadcast update to all other connected clients in the room
      socket.to(roomId).emit('playback-updated', {
        isPlaying: playback.isPlaying,
        progress: playback.progress
      });
      
      console.log(`[Room ${roomId}] Playback state updated by ${socket.data.username}: isPlaying=${playback.isPlaying}, progress=${playback.progress}s`);
    } catch (error) {
      console.error('Error setting playback state:', error);
    }
  });

  // Handle skip to next song
  socket.on('next-song', async () => {
    if (!socket.data.userId) {
      socket.emit('auth-error', { error: 'Please log in to skip songs.' });
      return;
    }
    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'Permission denied. You do not have write access in this room.' });
      return;
    }
    await playNextSong();
  });

  // Handle permission toggling by Host
  socket.on('toggle-permission', async (data: { targetUsername: string, canWrite: boolean }) => {
    if (!socket.data.userId) return;
    try {
      const host = await playlistService.getRoomHost(roomId);
      if (socket.data.username !== host) {
        socket.emit('auth-error', { error: 'Only the room host can modify permissions.' });
        return;
      }
      
      if (data.targetUsername === host) {
        socket.emit('auth-error', { error: 'Cannot modify permissions of the room host.' });
        return;
      }
      
      if (data.canWrite) {
        await playlistService.grantWritePermission(roomId, data.targetUsername);
      } else {
        await playlistService.revokeWritePermission(roomId, data.targetUsername);
      }
      
      console.log(`[Room ${roomId}] Permission toggled for ${data.targetUsername}: canWrite=${data.canWrite} by host ${host}`);
      await emitRoomMembers();
    } catch (err) {
      console.error('Error toggling permission:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${clientName} (${socket.id}) from Room: ${roomId}`);
    emitRoomMembers();
  });
};

