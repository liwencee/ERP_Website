import { Router } from 'express';
import * as auth from '../controllers/auth/auth.controller';
import { isGuest } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/security.middleware';

const router = Router();

router.get('/register', isGuest, auth.registerGet);
router.post('/register', isGuest, authLimiter, auth.registerPost);
router.get('/login', isGuest, auth.loginGet);
router.post('/login', isGuest, authLimiter, auth.loginPost);
router.get('/logout', auth.logout);
router.get('/verify-email/:token', auth.verifyEmail);
router.get('/verify-notice', auth.verifyNoticeGet);
router.post('/resend-verification', authLimiter, auth.resendVerification);
router.get('/forgot-password', isGuest, auth.forgotGet);
router.post('/forgot-password', isGuest, authLimiter, auth.forgotPost);
router.get('/reset-password/:token', isGuest, auth.resetGet);
router.post('/reset-password/:token', isGuest, authLimiter, auth.resetPost);

export default router;
