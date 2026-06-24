import { Router } from 'express';
import publicRoutes from './public.routes';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import adminRoutes from './admin.routes';
import * as webhooks from '../controllers/webhooks.controller';

const router = Router();

router.use('/', publicRoutes);
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);
router.post('/webhooks/squadco', webhooks.squadco);

// Browser redirect (callback_url) after the customer finishes paying.
router.get('/webhooks/squadco/callback', webhooks.squadcoCallback);

export default router;
