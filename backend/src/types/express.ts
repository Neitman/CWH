import { Server } from 'socket.io';
import { Request } from 'express';
import { UserTokenPayload } from './user';

declare global {
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
      io?: Server;
    }
  }
}

export interface AuthRequest extends Request {
  user?: UserTokenPayload;
  io?: Server;
}
