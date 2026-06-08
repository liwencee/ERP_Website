import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { formatCurrency, formatDate } from '../utils/helpers';

export default async function localsMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.info = req.flash('info');
  res.locals.currentPath = req.path;
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDate = formatDate;
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
          const [pendingDeposits, pendingKyc] = await Promise.all([
            prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
            prisma.user.count({ where: { kycStatus: 'SUBMITTED' } }),
          ]);
          res.locals.pendingDeposits = pendingDeposits;
          res.locals.pendingKyc = pendingKyc;
        }
      }
    } catch {
      // session may be stale
    }
  }

  next();
}
