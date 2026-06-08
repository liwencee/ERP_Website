import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Mark all as read on view
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  res.render('dashboard/notifications', { pageTitle: 'Notifications', notifications });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId: req.session.userId!, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
}
