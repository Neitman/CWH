import { Server, Socket } from 'socket.io';
import * as playlistService from '../services/playlistService';
import * as discussionService from '../services/discussionService';

export const registerStudyHandlers = (io: Server, socket: Socket, roomId: string) => {
  const clientName = socket.data.username || `Guest ${socket.id.slice(0, 4)}`;
  console.log(`Client connected to Watch Party room: ${clientName} (Socket: ${socket.id}) in Room: ${roomId}`);

  // Helper to emit updated members list of this room
  const emitRoomMembers = async () => {
    try {
      const sockets = await io.in(roomId).fetchSockets();
      const hostInfo = await playlistService.getRoomHostInfo(roomId);
      
      const rawMembersMap = new Map<string, { username: string; displayName: string; isHost: boolean; canWrite: boolean }>();

      for (const s of sockets) {
        const displayName = s.data.username || `Guest ${s.id.slice(0, 4)}`;
        const rawUsername = s.data.rawUsername || displayName;
        
        const isHost = hostInfo 
          ? (rawUsername.toLowerCase() === hostInfo.username.toLowerCase() || displayName.toLowerCase() === hostInfo.displayName.toLowerCase())
          : false;
        
        let canWrite = true;
        if (s.data.canWrite !== undefined) {
          canWrite = s.data.canWrite;
        }

        rawMembersMap.set(rawUsername.toLowerCase(), {
          username: rawUsername,
          displayName,
          isHost,
          canWrite
        });
      }

      const members = Array.from(rawMembersMap.values());
      io.to(roomId).emit('room-members-updated', {
        members,
        count: sockets.length
      });
    } catch (err) {
      console.error('Error emitting room members:', err);
    }
  };

  emitRoomMembers();

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

  // Socket joins specific room
  socket.join(roomId);

  // Send current room state (playlist + chat history + playback progress)
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
      console.error(`Error syncing state for room ${roomId}:`, error);
    }
  })();

  // --- DISCUSSION / CHAT HANDLERS ---
  socket.on('send-discussion-message', async (data: { message: string; videoTimestamp?: number }) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to send chat messages.' });
      return;
    }

    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    try {
      const savedMsg = await discussionService.saveDiscussionMessage(
        roomId,
        socket.data.userId || null,
        socket.data.username,
        data.message,
        data.videoTimestamp || 0
      );

      io.to(roomId).emit('new-discussion-message', savedMsg);
    } catch (err) {
      console.error('Error saving discussion message:', err);
    }
  });

  socket.on('clear-discussion', async () => {
    if (!socket.data.username) return;

    const hostInfo = await playlistService.getRoomHostInfo(roomId);
    const isHost = hostInfo 
      ? (socket.data.username.toLowerCase() === hostInfo.username.toLowerCase() || socket.data.username.toLowerCase() === hostInfo.displayName.toLowerCase())
      : false;

    if (!isHost) {
      socket.emit('auth-error', { error: 'Only the room host can clear chat history.' });
      return;
    }

    try {
      await discussionService.clearDiscussionMessages(roomId);
      io.to(roomId).emit('discussion-cleared');
    } catch (err) {
      console.error('Error clearing discussion:', err);
    }
  });

  // --- YOUTUBE PLAYLIST & PLAYBACK HANDLERS ---
  socket.on('add-song', async (songData: Omit<playlistService.Song, 'addedBy'>) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to add videos to the room queue.' });
      return;
    }

    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
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
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to add videos.' });
      return;
    }

    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
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
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to remove videos.' });
      return;
    }

    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
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

    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
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
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to skip videos.' });
      return;
    }

    const canWrite = await playlistService.hasWritePermission(roomId, socket.data.username);
    if (!canWrite) {
      socket.emit('auth-error', { error: 'You have Read Only permission in this room.' });
      return;
    }

    await playNextSong();
  });

  socket.on('toggle-permission', async (data: { targetUsername: string, canWrite: boolean }) => {
    if (!socket.data.username) return;
    try {
      const hostInfo = await playlistService.getRoomHostInfo(roomId);
      const isHost = hostInfo 
        ? (socket.data.username.toLowerCase() === hostInfo.username.toLowerCase() || socket.data.username.toLowerCase() === hostInfo.displayName.toLowerCase())
        : false;

      if (!isHost) {
        socket.emit('auth-error', { error: 'Only the room host can modify permissions.' });
        return;
      }
      
      if (data.canWrite) {
        await playlistService.grantWritePermission(roomId, data.targetUsername);
      } else {
        await playlistService.revokeWritePermission(roomId, data.targetUsername);
      }
      
      console.log(`[Room ${roomId}] Permission toggled for ${data.targetUsername}: canWrite=${data.canWrite}`);
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
