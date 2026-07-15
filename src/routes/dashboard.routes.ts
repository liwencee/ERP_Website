import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.middleware';
import { uploadKyc, uploadProof, uploadAvatar, protectedUpload } from '../middleware/upload.middleware';
import * as home from '../controllers/dashboard/home.controller';
import * as investment from '../controllers/dashboard/investment.controller';
import * as wallet from '../controllers/dashboard/wallet.controller';
import * as transaction from '../controllers/dashboard/transaction.controller';
import * as profile from '../controllers/dashboard/profile.controller';
import * as notification from '../controllers/dashboard/notification.controller';

const router = Router();

router.use(isAuthenticated);

router.get('/', home.index);
router.get('/investments', investment.index);
router.get('/investments/:planId/invest', investment.investGet);
router.post('/investments/:planId/invest', investment.investPost);
router.post('/investments/:id/redeem-early', investment.redeemEarly);
router.post('/investments/:id/change-tenure', investment.changeTenurePost);
router.get('/wallet', wallet.index);
router.post('/wallet/fund', wallet.fundPost);
router.post('/wallet/fund/upload',
  protectedUpload(uploadProof, 'proof', {
    allowed: ['jpg', 'png', 'pdf'], label: 'receipt (JPG, PNG or PDF)',
    redirect: '/dashboard/wallet', maxLabel: '5MB',
  }),
  wallet.fundUpload);
router.post('/wallet/withdraw', wallet.withdrawPost);
router.get('/transactions', transaction.index);
router.get('/profile', profile.profileGet);
router.post('/profile', profile.profilePost);
router.post('/profile/avatar',
  protectedUpload(uploadAvatar, 'avatar', {
    allowed: ['jpg', 'png', 'webp'], label: 'photo (JPG, PNG or WebP)',
    redirect: '/dashboard/profile', maxLabel: '2MB',
  }),
  profile.avatarPost);
router.post('/profile/password', profile.passwordPost);
router.get('/kyc', profile.kycGet);
router.post('/kyc',
  protectedUpload(uploadKyc, 'document', {
    allowed: ['jpg', 'png', 'pdf'], label: 'document (JPG, PNG or PDF)',
    redirect: '/dashboard/kyc', maxLabel: '5MB',
  }),
  profile.kycPost);
router.get('/notifications', notification.index);
router.post('/notifications/mark-read', notification.markRead);

export default router;
