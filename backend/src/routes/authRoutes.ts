import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { uploadAvatarMiddleware } from '../middlewares/uploadMiddleware';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp-register', authController.verifyOtpRegister);
router.post('/forgot-password/send-otp', authController.forgotPasswordSendOtp);
router.post('/forgot-password/reset', authController.resetPasswordWithOtp);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticateToken, authController.logout);
router.get('/me', authenticateToken, authController.getMe);
router.put('/profile', authenticateToken, authController.updateProfile);
router.post('/avatar', authenticateToken, uploadAvatarMiddleware.single('avatar'), authController.uploadAvatar);

export default router;
