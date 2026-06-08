import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(_req: Request, res: Response): Promise<void> {
  const [
    totalUsers,
    totalInvestments,
    pendingDeposits,
    pendingKyc,
    totalAUM,
    recentUsers,
    recentTransactions,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'INVESTOR' } }),
    prisma.userInvestment.count({ where: { status: 'ACTIVE' } }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    prisma.user.count({ where: { kycStatus: 'SUBMITTED' } }),
    prisma.userInvestment.aggregate({ where: { status: 'ACTIVE' }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { role: 'INVESTOR' }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { user: { select: { firstName: true, lastName: true } } } }),
  ]);

  res.render('admin/dashboard', {
    pageTitle: 'Admin Dashboard',
    totalUsers,
    totalInvestments,
    pendingDeposits,
    pendingKyc,
    totalAUM: Number(totalAUM._sum.amount || 0),
    recentUsers,
    recentTransactions,
  });
}
