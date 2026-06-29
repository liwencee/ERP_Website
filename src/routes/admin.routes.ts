import { Router } from 'express';
import { isAdmin, isAdminOrStaff } from '../middleware/auth.middleware';
import * as adminDash from '../controllers/admin/dashboard.controller';
import * as adminUsers from '../controllers/admin/users.controller';
import * as adminPlans from '../controllers/admin/plans.controller';
import * as adminInvestments from '../controllers/admin/investments.controller';
import * as adminTx from '../controllers/admin/transactions.controller';
import * as adminAudit from '../controllers/admin/audit.controller';

const router = Router();

// All admin routes require at least STAFF role
router.use(isAdminOrStaff);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/', adminDash.index);

// ─── Users ───────────────────────────────────────────────────────────────────
router.get('/users', adminUsers.index);
// Creating staff accounts is restricted to ADMIN only
router.get('/users/create-staff', isAdmin, adminUsers.createStaffGet);
router.post('/users/create-staff', isAdmin, adminUsers.createStaffPost);
router.get('/users/:id', adminUsers.show);
router.post('/users/:id/kyc', adminUsers.reviewKyc);
router.post('/users/:id/status', adminUsers.toggleStatus);
router.post('/users/:id/force-logout', adminUsers.forceLogout);
router.post('/users/:id/credit-wallet', adminUsers.creditWallet);
router.post('/users/:id/debit-wallet', adminUsers.debitWallet);
// Permanently delete a user — ADMIN only
router.post('/users/:id/delete', isAdmin, adminUsers.deleteUser);

// ─── Plans ───────────────────────────────────────────────────────────────────
router.get('/plans', adminPlans.index);
// Mutating plans is restricted to ADMIN only
router.get('/plans/new', isAdmin, adminPlans.newGet);
router.post('/plans/new', isAdmin, adminPlans.newPost);
router.get('/plans/:id/edit', isAdmin, adminPlans.editGet);
router.post('/plans/:id/edit', isAdmin, adminPlans.editPost);
router.post('/plans/:id/delete', isAdmin, adminPlans.deletePlan);

// ─── Investments ─────────────────────────────────────────────────────────────
router.get('/investments', adminInvestments.index);
router.post('/investments/backdate', isAdmin, adminTx.backdateInvestment);

// ─── Transactions ─────────────────────────────────────────────────────────────
router.get('/transactions', adminTx.index);
router.post('/transactions/:id/confirm', adminTx.confirm);
router.post('/transactions/:id/reject', adminTx.reject);

// ─── Audit log (ADMIN only) ───────────────────────────────────────────────────
router.get('/audit', isAdmin, adminAudit.index);

export default router;
