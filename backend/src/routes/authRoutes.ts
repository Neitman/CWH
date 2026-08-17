import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import redis from '../config/redis';
import { sendOTPEmail, sendWelcomeEmail } from '../services/emailService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'wp_super_secret_key_12345';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'wp_refresh_secret_key_67890';

// Helper to generate 5-minute Access Token
export function generateAccessToken(user: { id: number; username: string; display_name?: string; displayName?: string }) {
  return jwt.sign(
    { id: user.id, username: user.username, displayName: user.display_name || user.displayName || user.username },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

// Helper to generate 7-day Refresh Token and store in Redis
export async function generateRefreshToken(user: { id: number; username: string }) {
  const refreshToken = jwt.sign(
    { id: user.id, username: user.username },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  await redis.setex(`wp:refreshtoken:${user.id}`, 7 * 86400, refreshToken);
  return refreshToken;
}

// Multer Storage Setup for Avatars
const avatarsDir = path.join(__dirname, '../../public/uploads/avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req: any, file, cb) => {
    const userId = req.user ? req.user.id : 'user';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${userId}-${uniqueSuffix}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// 1. Traditional Register endpoint (modified to include optional email)
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  if (normalizedUsername.length < 3 || password.length < 6) {
    return res.status(400).json({ 
      error: 'Username must be at least 3 characters and password at least 6 characters.' 
    });
  }

  try {
    // Check if username taken
    const userCheck = await query('SELECT id FROM users WHERE username = $1', [normalizedUsername]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    // Check if email taken
    if (normalizedEmail) {
      const emailCheck = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Email is already registered.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [normalizedUsername, normalizedEmail, hashedPassword]
    );

    const newUser = result.rows[0];
    
    // Send welcome email if email provided
    if (normalizedEmail) {
      await sendWelcomeEmail(normalizedEmail, newUser.username);
    }

    return res.status(201).json({ 
      message: 'User registered successfully!',
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// 1B. Send Registration OTP
router.post('/register-send-otp', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedUsername.length < 3 || password.length < 6) {
    return res.status(400).json({ 
      error: 'Username must be at least 3 characters and password at least 6 characters.' 
    });
  }

  try {
    // Validate if username taken
    const userCheck = await query('SELECT id FROM users WHERE username = $1', [normalizedUsername]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    // Validate if email taken
    const emailCheck = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    // Hash password beforehand
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Cache registration details in Redis (expires in 5 minutes)
    const redisKey = `wp:register-otp:${normalizedEmail}`;
    const payload = JSON.stringify({ username: normalizedUsername, email: normalizedEmail, hashedPassword, otp });
    await redis.setex(redisKey, 300, payload);

    // Send email with OTP
    await sendOTPEmail(normalizedEmail, otp, 'register');

    return res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('Register OTP send error:', error);
    return res.status(500).json({ error: 'Internal server error sending registration OTP.' });
  }
});

// 1C. Verify Registration OTP and Create User
router.post('/register-verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and verification OTP are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const redisKey = `wp:register-otp:${normalizedEmail}`;
    const dataStr = await redis.get(redisKey);

    if (!dataStr) {
      return res.status(400).json({ error: 'Verification code expired or invalid. Please sign up again.' });
    }

    const payload = JSON.parse(dataStr);

    if (payload.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Insert user into Database
    const result = await query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [payload.username, payload.email, payload.hashedPassword]
    );

    const newUser = result.rows[0];

    // Clean up Redis key
    await redis.del(redisKey);

    // Dispatch welcome email
    await sendWelcomeEmail(payload.email, payload.username);

    // Generate Access Token
    const accessToken = generateAccessToken({ id: newUser.id, username: newUser.username });

    return res.status(201).json({
      message: 'Email verified and registration complete!',
      token: accessToken,
      accessToken,
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (error) {
    console.error('Register OTP verify error:', error);
    return res.status(500).json({ error: 'Internal server error verifying registration OTP.' });
  }
});

// 1D. Send Forgot Password OTP
router.post('/forgot-password-send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if email exists in database
    const userRes = await query('SELECT id, username FROM users WHERE email = $1', [normalizedEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'No user account found with this email address.' });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Cache OTP in Redis (expires in 5 minutes)
    const redisKey = `wp:reset-otp:${normalizedEmail}`;
    await redis.setex(redisKey, 300, otp);

    // Send email with OTP
    await sendOTPEmail(normalizedEmail, otp, 'reset');

    return res.status(200).json({ message: 'Password reset code sent to your email.' });
  } catch (error) {
    console.error('Forgot password OTP send error:', error);
    return res.status(500).json({ error: 'Internal server error sending reset OTP.' });
  }
});

// 1E. Verify Reset OTP and Update Password
router.post('/reset-password-verify-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, reset OTP, and new password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  try {
    const redisKey = `wp:reset-otp:${normalizedEmail}`;
    const savedOtp = await redis.get(redisKey);

    if (!savedOtp) {
      return res.status(400).json({ error: 'Reset code expired or invalid. Please request a new one.' });
    }

    if (savedOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid password reset code.' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in DB
    await query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, normalizedEmail]);

    // Clean up Redis key
    await redis.del(redisKey);

    return res.status(200).json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Forgot password OTP reset verify error:', error);
    return res.status(500).json({ error: 'Internal server error updating password.' });
  }
});

// 2. Login endpoint
router.post('/login', async (req, res) => {
  const { username, password, rememberMe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    // Find user by username
    const result = await query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Always generate Access Token
    const accessToken = generateAccessToken({ id: user.id, username: user.username });

    // Handle Refresh Token based on Remember Me
    if (rememberMe) {
      const refreshToken = await generateRefreshToken({ id: user.id, username: user.username });
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
      });
    } else {
      res.clearCookie('refreshToken', { path: '/' });
    }

    return res.json({
      message: 'Login successful!',
      token: accessToken,
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// 3. Profile Fetching (verify token and return full user details)
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  try {
    const result = await query(
      'SELECT id, username, email, display_name, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 4. Update Profile (Display Name)
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const { displayName } = req.body;
  const cleanDisplayName = displayName ? displayName.trim() : null;

  try {
    const result = await query(
      'UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, username, email, display_name, avatar_url',
      [cleanDisplayName, req.user.id]
    );
    return res.json({
      message: 'Profile updated successfully!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 5. Upload Avatar Image
router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Please select an image file to upload.' });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  try {
    await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.id]);
    return res.json({
      message: 'Avatar uploaded successfully!',
      avatarUrl
    });
  } catch (error) {
    console.error('Error saving avatar URL:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 6. Refresh Access Token using Refresh Token from Cookie
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { id: number; username: string; displayName?: string };

    // Verify refresh token in Redis with graceful error catch
    try {
      const storedToken = await redis.get(`wp:refreshtoken:${decoded.id}`);
      if (storedToken && storedToken !== refreshToken) {
        res.clearCookie('refreshToken', { path: '/' });
        return res.status(403).json({ error: 'Invalid or revoked refresh token. Please log in again.' });
      }
    } catch (redisErr) {
      console.warn('Redis check bypassed during refresh:', redisErr);
    }

    // Generate new 5-minute Access Token
    const newAccessToken = generateAccessToken({ id: decoded.id, username: decoded.username, displayName: decoded.displayName });

    return res.json({
      accessToken: newAccessToken,
      token: newAccessToken
    });
  } catch (error) {
    res.clearCookie('refreshToken', { path: '/' });
    return res.status(403).json({ error: 'Expired or invalid refresh token.' });
  }
});

// 7. Logout Endpoint (Revokes Refresh Token in Redis and clears cookie)
router.post('/logout', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user) {
    try {
      await redis.del(`wp:refreshtoken:${req.user.id}`);
    } catch (err) {
      console.error('Error revoking refresh token:', err);
    }
  }
  res.clearCookie('refreshToken', { path: '/' });
  return res.json({ message: 'Logged out successfully.' });
});

export default router;
