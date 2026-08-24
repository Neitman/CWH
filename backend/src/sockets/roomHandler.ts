import { Server, Socket } from 'socket.io';
import * as playlistService from '../services/playlistService';

export const registerRoomHandlers = (io: Server, socket: Socket, roomId: string) => {
  const emitRoomMembers = async () => {
    try {
      const sockets = await io.in(roomId).fetchSockets();
      let hostInfo = await playlistService.getRoomHostInfo(roomId);
      
      if (!hostInfo && sockets.length > 0) {
        for (const s of sockets) {
          const firstUser = s.data.rawUsername || s.data.username;
          if (firstUser && !firstUser.startsWith('Guest ') && !firstUser.startsWith('User_')) {
            await playlistService.setRoomHost(roomId, firstUser);
            hostInfo = await playlistService.getRoomHostInfo(roomId);
            break;
          }
        }
      }

      const rawMembersMap = new Map<string, { username: string; displayName: string; isHost: boolean; canWrite: boolean }>();

      for (const s of sockets) {
        const displayName = s.data.username || `Guest ${s.id.slice(0, 4)}`;
        const rawUsername = s.data.rawUsername || displayName;
        
        const isHost = hostInfo 
          ? (rawUsername.toLowerCase() === hostInfo.username.toLowerCase() || displayName.toLowerCase() === hostInfo.displayName.toLowerCase())
          : false;
        
        const canWrite = await playlistService.hasWritePermission(roomId, rawUsername);

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

  socket.on('toggle-permission', async (data: { targetUsername: string, canWrite: boolean }) => {
    if (!socket.data.username) return;
    try {
      const userIdentifier = socket.data.rawUsername || socket.data.username;
      const hostInfo = await playlistService.getRoomHostInfo(roomId);
      const isHost = hostInfo 
        ? (userIdentifier.toLowerCase() === hostInfo.username.toLowerCase() || userIdentifier.toLowerCase() === hostInfo.displayName.toLowerCase())
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
    const clientName = socket.data.username || `Guest ${socket.id.slice(0, 4)}`;
    console.log(`Client disconnected: ${clientName} (${socket.id}) from Room: ${roomId}`);
    emitRoomMembers();
  });

  return { emitRoomMembers };
};
