import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';

export async function isAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    req.flash('error', 'Please log in to continue.');
    res.redirect('/auth/login');
    return;
  }
  // Check session version for force-logout support
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { sessionVersion: true, status: true } });
  if (!user || user.status === 'SUSPENDED') {
    req.session.destroy(() => {});
    req.flash('error', user?.status === 'SUSPENDED' ? 'Your account has been suspended.' : 'Session invalid.');
    res.redirect('/auth/login');
    return;
  }
  if (req.session.sessionVersion !== undefined && req.session.sessionVersion !== user.sessionVersion) {
    req.session.destroy(() => {});
    res.redirect('/auth/login');
    return;
  }
  next();
}

export function isAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session.userId && req.session.userRole === 'ADMIN') return next();
  res.status(403).render('errors/404', { title: 'Access Denied' });
}

export function isAdminOrStaff(req: Request, res: Response, next: NextFunction): void {
  const role = req.session.userRole;
  if (req.session.userId && (role === 'ADMIN' || role === 'STAFF')) return next();
  res.status(403).render('errors/404', { title: 'Access Denied' });
}

export function isStaff(req: Request, res: Response, next: NextFunction): void {
  const role = req.session.userRole;
  if (req.session.userId && (role === 'ADMIN' || role === 'STAFF')) return next();
  res.status(403).render('errors/404', { title: 'Access Denied' });
}

export function isGuest(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) return next();
  // Send already-authenticated users to their correct home: admins/staff to the
  // admin panel, investors to their personal dashboard.
  const role = req.session.userRole;
  res.redirect(role === 'ADMIN' || role === 'STAFF' ? '/admin' : '/dashboard');
}
