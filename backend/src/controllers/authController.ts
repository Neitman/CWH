import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import redis from '../config/redis';
import { HTTP_STATUS } from '../constants/httpStatus';
import * as userModel from '../models/userModel';
import { sendOTPEmail, sendWelcomeEmail } from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'wp_super_secret_key_12345';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'wp_refresh_secret_key_67890';

export function generateAccessToken(user: { id: number; username: string; display_name?: string; displayName?: string }) {
  const options: SignOptions = { expiresIn: '5m' };
  return jwt.sign(
    { id: user.id, username: user.username, displayName: user.display_name || user.displayName || user.username },
    JWT_SECRET,
    options
  );
}

export async function generateRefreshToken(user: { id: number; username: string }) {
  const options: SignOptions = { expiresIn: '7d' };
  const refreshToken = jwt.sign(
    { id: user.id, username: user.username },
    REFRESH_SECRET,
    options
  );
  await redis.setex(`wp:refreshtoken:${user.id}`, 7 * 86400, refreshToken);
  return refreshToken;
}

export const register = async (req: Request, res: Response) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Username and password are required.' });
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  if (normalizedUsername.length < 3 || password.length < 6) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      error: 'Username must be at least 3 characters and password at least 6 characters.' 
    });
  }

  try {
    const existingUser = await userModel.findUserByUsername(normalizedUsername);
    if (existingUser) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Username is already taken.' });
    }

    if (normalizedEmail) {
      const existingEmail = await userModel.findUserByEmail(normalizedEmail);
      if (existingEmail) {
        return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Email is already registered.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await userModel.createUser(normalizedUsername, hashedPassword, normalizedEmail || undefined);
    const accessToken = generateAccessToken(newUser);
    const refreshToken = await generateRefreshToken(newUser);

    if (normalizedEmail) {
      sendWelcomeEmail(normalizedEmail, normalizedUsername).catch(err => console.error('Failed to send welcome email:', err));
    }

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Account registered successfully.',
      token: accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.display_name,
        avatarUrl: newUser.avatar_url,
        createdAt: newUser.created_at
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error during registration.' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Username/Email and password are required.' });
  }

  try {
    const input = username.trim();
    let user = await userModel.findUserByUsername(input);
    if (!user && input.includes('@')) {
      user = await userModel.findUserByEmail(input);
    }

    if (!user || !user.password) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid username/email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid username/email or password.' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    return res.json({
      message: 'Login successful.',
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error during login.' });
  }
};

export const sendOtp = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Valid email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await userModel.findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Email is already registered.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.setex(`wp:otp:${normalizedEmail}`, 300, otp);

    await sendOTPEmail(normalizedEmail, otp, 'register');

    return res.json({ message: 'OTP has been sent to your email.' });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error sending OTP.' });
  }
};

export const verifyOtpRegister = async (req: Request, res: Response) => {
  const { username, password, email, otp } = req.body;

  if (!username || !password || !email || !otp) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'All fields (username, password, email, otp) are required.' });
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const storedOtp = await redis.get(`wp:otp:${normalizedEmail}`);
    if (!storedOtp || storedOtp !== otp.trim()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid or expired OTP code.' });
    }

    const userCheck = await userModel.findUserByUsername(normalizedUsername);
    if (userCheck) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Username is already taken.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await userModel.createUser(normalizedUsername, hashedPassword, normalizedEmail);
    await redis.del(`wp:otp:${normalizedEmail}`);

    const accessToken = generateAccessToken(newUser);
    const refreshToken = await generateRefreshToken(newUser);

    sendWelcomeEmail(normalizedEmail, normalizedUsername).catch(err => console.error('Failed to send welcome email:', err));

    return res.status(HTTP_STATUS.CREATED).json({
      message: 'Account registered successfully with email verification.',
      token: accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.display_name,
        avatarUrl: newUser.avatar_url,
        createdAt: newUser.created_at
      }
    });
  } catch (error) {
    console.error('Verify OTP Register error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error completing registration.' });
  }
};

export const forgotPasswordSendOtp = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await userModel.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'No account found with this email address.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redis.setex(`wp:reset_otp:${normalizedEmail}`, 300, otp);

    await sendOTPEmail(normalizedEmail, otp, 'reset');
    return res.json({ message: 'Password reset OTP sent to email.' });
  } catch (error) {
    console.error('Forgot password OTP error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error sending password reset OTP.' });
  }
};

export const resetPasswordWithOtp = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email, OTP, and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'New password must be at least 6 characters.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const storedOtp = await redis.get(`wp:reset_otp:${normalizedEmail}`);
    if (!storedOtp || storedOtp !== otp.trim()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid or expired OTP code.' });
    }

    const user = await userModel.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await userModel.updateUserPassword(user.id, hashedPassword);
    await redis.del(`wp:reset_otp:${normalizedEmail}`);

    return res.json({ message: 'Password reset successfully. You can now login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error resetting password.' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Refresh token is required.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { id: number; username: string };
    const storedToken = await redis.get(`wp:refreshtoken:${decoded.id}`);

    if (!storedToken || storedToken !== refreshToken) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await userModel.findUserById(decoded.id);
    if (!user) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'User not found.' });
    }

    const newAccessToken = generateAccessToken(user);
    return res.json({ token: newAccessToken });
  } catch (error) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Invalid or expired refresh token.' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    if (req.user) {
      await redis.del(`wp:refreshtoken:${req.user.id}`);
    }
    return res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error logging out.' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Not authenticated' });
    }
    const user = await userModel.findUserById(req.user.id);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error getting profile.' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Not authenticated' });
    }
    const { displayName } = req.body;
    const updated = await userModel.updateUserProfile(req.user.id, displayName);

    return res.json({
      message: 'Profile updated successfully.',
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        displayName: updated.display_name,
        avatarUrl: updated.avatar_url,
        createdAt: updated.created_at
      }
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error updating profile.' });
  }
};

export const uploadAvatar = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Not authenticated' });
    }
    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No image file uploaded.' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const updated = await userModel.updateUserProfile(req.user.id, undefined, avatarUrl);

    return res.json({
      message: 'Avatar uploaded successfully.',
      avatarUrl,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        displayName: updated.display_name,
        avatarUrl: updated.avatar_url,
        createdAt: updated.created_at
      }
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server error uploading avatar.' });
  }
};
