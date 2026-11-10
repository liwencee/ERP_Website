import { Router } from 'express';
import * as auth from '../controllers/auth/auth.controller';
import { isGuest } from '../middleware/auth.middleware';
import { loginLimiter, signupLimiter, recoveryLimiter } from '../middleware/security.middleware';

const router = Router();

router.get('/register', isGuest, auth.registerGet);
router.post('/register', isGuest, signupLimiter, auth.registerPost);
router.get('/login', isGuest, auth.loginGet);
router.post('/login', isGuest, loginLimiter, auth.loginPost);
router.get('/logout', auth.logout);
router.get('/verify-email/:token', auth.verifyEmail);
router.get('/verify-notice', auth.verifyNoticeGet);
router.post('/resend-verification', recoveryLimiter, auth.resendVerification);
router.get('/forgot-password', isGuest, auth.forgotGet);
router.post('/forgot-password', isGuest, recoveryLimiter, auth.forgotPost);
router.get('/reset-password/:token', isGuest, auth.resetGet);
router.post('/reset-password/:token', isGuest, recoveryLimiter, auth.resetPost);

export default router;
