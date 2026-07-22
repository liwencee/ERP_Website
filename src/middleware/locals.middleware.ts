import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { formatCurrency, formatDate, formatDateTime, planDisplayName } from '../utils/helpers';

export default async function localsMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.info = req.flash('info');
  res.locals.currentPath = req.path;
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDate = formatDate;
  res.locals.formatDateTime = formatDateTime;
  res.locals.planDisplayName = planDisplayName;
  res.locals.user = null;
  res.locals.unreadCount = 0;

  if (req.session.userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.session.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          kycStatus: true,
          bankName: true,
          bankAccountNumber: true,
          bankAccountName: true,
        },
      });

      if (user) {
        res.locals.user = user;
        const unreadCount = await prisma.notification.count({
          where: { userId: user.id, read: false },
        });
        res.locals.unreadCount = unreadCount;

        // Inject admin sidebar badge counts for ADMIN / STAFF users
        if (user.role === 'ADMIN' || user.role === 'STAFF') {
          const [pendingDeposits, pendingWithdrawals, pendingKyc, pendingTenureRequests] = await Promise.all([
            prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
            prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
            prisma.user.count({ where: { kycStatus: 'SUBMITTED' } }),
            prisma.tenureChangeRequest.count({ where: { status: 'PENDING' } }),
          ]);
          res.locals.pendingDeposits = pendingDeposits;
          res.locals.pendingWithdrawals = pendingWithdrawals;
          // Sidebar "Transactions" badge covers both — an admin shouldn't have to
          // know whether it's a deposit or withdrawal waiting before they check.
          res.locals.pendingTransactions = pendingDeposits + pendingWithdrawals;
          res.locals.pendingKyc = pendingKyc;
          res.locals.pendingTenureRequests = pendingTenureRequests;
        }
      }
    } catch {
      // session may be stale
    }
  }

  next();
}
