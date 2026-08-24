import { Server, Socket } from 'socket.io';
import { registerSocketHandlers } from './index';

export const registerStudyHandlers = (io: Server, socket: Socket, _roomId?: string) => {
  registerSocketHandlers(io, socket);
};
