import { Router } from 'express';
import * as auth from '../controllers/auth/auth.controller';
import { isGuest } from '../middleware/auth.middleware';

const router = Router();

router.get('/register', isGuest, auth.registerGet);
router.post('/register', isGuest, auth.registerPost);
router.get('/login', isGuest, auth.loginGet);
router.post('/login', isGuest, auth.loginPost);
router.get('/logout', auth.logout);
router.get('/verify-email/:token', auth.verifyEmail);
router.get('/forgot-password', isGuest, auth.forgotGet);
router.post('/forgot-password', isGuest, auth.forgotPost);
router.get('/reset-password/:token', isGuest, auth.resetGet);
router.post('/reset-password/:token', isGuest, auth.resetPost);

export default router;
