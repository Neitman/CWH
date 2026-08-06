import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import redis from '../config/redis';
import { sendOTPEmail, sendWelcomeEmail } from '../services/emailService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cwh_super_secret_key_12345';

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
    const redisKey = `cwh:register-otp:${normalizedEmail}`;
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
    const redisKey = `cwh:register-otp:${normalizedEmail}`;
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

    // Generate JWT token automatically so they log in right away
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Email verified and registration complete!',
      token,
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
    const redisKey = `cwh:reset-otp:${normalizedEmail}`;
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
    const redisKey = `cwh:reset-otp:${normalizedEmail}`;
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
  const { username, password } = req.body;

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

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' } // Token lasts 7 days
    );

    return res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// 3. Profile Fetching (verify token and return user details)
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  return res.json({ user: req.user });
});

export default router;
