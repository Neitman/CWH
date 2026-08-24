import { Server, Socket } from 'socket.io';
import * as discussionService from '../services/discussionService';
import * as playlistService from '../services/playlistService';

export const registerChatHandlers = (io: Server, socket: Socket, roomId: string) => {
  socket.on('send-discussion-message', async (data: { message: string; videoTimestamp?: number }) => {
    if (!socket.data.username) {
      socket.emit('auth-error', { error: 'Please log in to send chat messages.' });
      return;
    }

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const canWrite = await playlistService.hasWritePermission(roomId, userIdentifier);
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

    const userIdentifier = socket.data.rawUsername || socket.data.username;
    const hostInfo = await playlistService.getRoomHostInfo(roomId);
    const isHost = hostInfo 
      ? (userIdentifier.toLowerCase() === hostInfo.username.toLowerCase() || userIdentifier.toLowerCase() === hostInfo.displayName.toLowerCase())
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
};
