import { Server, Socket } from 'socket.io';
import { registerRoomHandlers } from './roomHandler';
import { registerPlaybackHandlers } from './playbackHandler';
import { registerChatHandlers } from './chatHandler';
import * as playlistService from '../services/playlistService';
import * as discussionService from '../services/discussionService';

export const registerSocketHandlers = (io: Server, socket: Socket) => {
  const roomId = socket.data.roomId || 'lobby';
  const clientName = socket.data.username || `Guest ${socket.id.slice(0, 4)}`;

  console.log(`Client connected: ${clientName} (${socket.id}) in Room: ${roomId}`);
  socket.join(roomId);

  // Sync initial room state to newly connected client
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
      console.error(`Error syncing initial state for room ${roomId}:`, error);
    }
  })();

  // Register modular handlers
  registerRoomHandlers(io, socket, roomId);
  registerPlaybackHandlers(io, socket, roomId);
  registerChatHandlers(io, socket, roomId);
};
