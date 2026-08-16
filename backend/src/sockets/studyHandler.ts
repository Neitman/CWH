import { Server, Socket } from 'socket.io';
import * as playlistService from '../services/playlistService';
import * as discussionService from '../services/discussionService';

export const registerStudyHandlers = (io: Server, socket: Socket, roomId: string) => {
  const clientName = socket.data.username || `Guest ${socket.id.slice(0, 4)}`;
  console.log(`Client connected to STG study room: ${clientName} (Socket: ${socket.id}) in Room: ${roomId}`);
  
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

  // Sync initial state (playlist, playback, chat history) with newly connected client
  (async () => {
    try {
      const playlist = await playlistService.getPlaylistQueue(roomId);
      const { currentSong, playback } = await playlistService.getPlaybackState(roomId);
      const chatHistory = await discussionService.getRecentDiscussionMessages(roomId);
      
      socket.emit('sync-state', {
        playlist,
        currentSong,
        playback: {
          isPlaying: playback.isPlaying,
          progress: playback.progress
        },
        chatHistory
      });
    } catch (error) {
      console.error('Error syncing connection state:', error);
    }
  })();

  // Helper to handle skip/pop to next video
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

  // --- REAL-TIME DISCUSSION HANDLERS ---
  socket.on('send-discussion-message', async (data: { message: string; videoTimestamp?: number | null }) => {
    if (!data || !data.message || !data.message.trim()) return;
    try {
      const username = socket.data.username || `Guest ${socket.id.slice(0, 4)}`;
      const userId = socket.data.userId || null;
      const videoTimestamp = typeof data.videoTimestamp === 'number' ? Math.floor(data.videoTimestamp) : null;
      
      const newMsg = await discussionService.saveDiscussionMessage(
        roomId,
        userId,
        username,
        data.message.trim(),
        videoTimestamp
      );
      
      io.to(roomId).emit('new-discussion-message', newMsg);
      console.log(`[Room ${roomId}] New discussion message from ${username}${videoTimestamp !== null ? ` (@ ${videoTimestamp}s)` : ''}`);
    } catch (err) {
      console.error('Error saving discussion message:', err);
    }
  });

  socket.on('clear-discussion', async () => {
    try {
      const host = await playlistService.getRoomHost(roomId);
      if (socket.data.username !== host) {
        socket.emit('auth-error', { error: 'Only the room host can clear discussion history.' });
        return;
      }
      await discussionService.clearDiscussionMessages(roomId);
      io.to(roomId).emit('discussion-cleared');
      console.log(`[Room ${roomId}] Discussion history cleared by host ${host}`);
    } catch (err) {
      console.error('Error clearing discussion:', err);
    }
  });

  // --- YOUTUBE PLAYLIST & PLAYBACK HANDLERS ---
  socket.on('add-song', async (songData: Omit<playlistService.Song, 'addedBy'>) => {
    if (socket.data.userId === undefined || socket.data.userId === null) {
      socket.emit('auth-error', { error: 'Please log in to add videos to the study queue.' });
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

      // Auto play if no video is currently playing
      const { currentSong } = await playlistService.getPlaybackState(roomId);
      if (!currentSong) {
        await playNextSong();
      }
    } catch (error) {
      console.error('Error adding video to playlist:', error);
    }
  });

  socket.on('add-songs', async (songsData: Omit<playlistService.Song, 'addedBy'>[]) => {
    if (socket.data.userId === undefined || socket.data.userId === null) {
      socket.emit('auth-error', { error: 'Please log in to add videos.' });
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

      // Auto play if no video is currently playing
      const { currentSong } = await playlistService.getPlaybackState(roomId);
      if (!currentSong) {
        await playNextSong();
      }
    } catch (error) {
      console.error('Error adding batch videos to playlist:', error);
    }
  });

  socket.on('remove-song', async (songId: string) => {
    if (socket.data.userId === undefined || socket.data.userId === null) {
      socket.emit('auth-error', { error: 'Please log in to remove videos.' });
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
    if (socket.data.userId === undefined || socket.data.userId === null) {
      socket.emit('auth-error', { error: 'Please log in to control playback.' });
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

  socket.on('next-song', async () => {
    if (socket.data.userId === undefined || socket.data.userId === null) {
      socket.emit('auth-error', { error: 'Please log in to skip videos.' });
      return;
    }
    await playNextSong();
  });

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
