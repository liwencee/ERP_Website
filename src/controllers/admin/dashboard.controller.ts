import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(_req: Request, res: Response): Promise<void> {
  const [
    totalUsers,
    totalInvestments,
    pendingDeposits,
    pendingWithdrawals,
    pendingKyc,
    pendingTenureRequests,
    totalAUM,
    recentUsers,
    recentTransactions,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'INVESTOR' } }),
    prisma.userInvestment.count({ where: { status: 'ACTIVE' } }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    prisma.transaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
    prisma.user.count({ where: { kycStatus: 'SUBMITTED' } }),
    prisma.tenureChangeRequest.count({ where: { status: 'PENDING' } }),
    prisma.userInvestment.aggregate({ where: { status: 'ACTIVE' }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { role: 'INVESTOR' }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { user: { select: { firstName: true, lastName: true } } } }),
  ]);

  res.render('admin/dashboard', {
    pageTitle: 'Admin Dashboard',
    totalUsers,
    totalInvestments,
    pendingDeposits,
    pendingWithdrawals,
    pendingKyc,
    pendingTenureRequests,
    totalAUM: Number(totalAUM._sum.amount || 0),
    recentUsers,
    recentTransactions,
  });
}
