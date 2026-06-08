import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;

  const [wallet, activeInvestments, recentTransactions, totalInvested] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.userInvestment.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.userInvestment.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
  ]);

  res.render('dashboard/index', {
    pageTitle: 'Dashboard',
    wallet,
    activeInvestments,
    recentTransactions,
    totalInvested: Number(totalInvested._sum.amount || 0),
  });
}
