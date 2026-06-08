import { Router } from 'express';
import { isAdmin } from '../middleware/auth.middleware';
import * as adminDash from '../controllers/admin/dashboard.controller';
import * as adminUsers from '../controllers/admin/users.controller';
import * as adminPlans from '../controllers/admin/plans.controller';
import * as adminInvestments from '../controllers/admin/investments.controller';
import * as adminTx from '../controllers/admin/transactions.controller';

const router = Router();

router.use(isAdmin);

router.get('/', adminDash.index);

router.get('/users', adminUsers.index);
router.get('/users/create-staff', adminUsers.createStaffGet);
router.post('/users/create-staff', adminUsers.createStaffPost);
router.get('/users/:id', adminUsers.show);
router.post('/users/:id/kyc', adminUsers.reviewKyc);
router.post('/users/:id/status', adminUsers.toggleStatus);
router.post('/users/:id/force-logout', adminUsers.forceLogout);

router.get('/plans', adminPlans.index);
router.get('/plans/new', adminPlans.newGet);
router.post('/plans/new', adminPlans.newPost);
router.get('/plans/:id/edit', adminPlans.editGet);
router.post('/plans/:id/edit', adminPlans.editPost);
router.post('/plans/:id/delete', adminPlans.deletePlan);

router.get('/investments', adminInvestments.index);
router.post('/investments/backdate', adminTx.backdateInvestment);

router.get('/transactions', adminTx.index);
router.post('/transactions/:id/confirm', adminTx.confirm);
router.post('/transactions/:id/reject', adminTx.reject);

export default router;
