import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';
import { UserTokenPayload } from '../types/user';

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (payload: UserTokenPayload, expiresIn: SignOptions['expiresIn'] = '7d'): string => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
};

export const verifyToken = (token: string): UserTokenPayload => {
  return jwt.verify(token, config.jwtSecret) as UserTokenPayload;
};

export const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
