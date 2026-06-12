import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;

  const [wallet, activeInvestments, recentTransactions, totalInvested, allActive] =
    await Promise.all([
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
      prisma.userInvestment.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { amount: true, expectedReturn: true, startDate: true, maturityDate: true },
      }),
    ]);

  // Live "Investment Value": principal + the share of each active investment's
  // return that has accrued so far, prorated by how far it is between its start
  // and maturity dates. Recomputed on every load, so it grows day by day.
  const now = Date.now();
  let activePrincipal = 0;
  let currentValue = 0;
  for (const inv of allActive) {
    const principal = Number(inv.amount);
    const expected = Number(inv.expectedReturn);
    const start = new Date(inv.startDate).getTime();
    const end = new Date(inv.maturityDate).getTime();
    const totalMs = end - start;
    const elapsed = Math.min(Math.max(now - start, 0), totalMs > 0 ? totalMs : 0);
    const progress = totalMs > 0 ? elapsed / totalMs : 1;
    activePrincipal += principal;
    currentValue += principal + (expected - principal) * progress;
  }
  const returnsEarned = currentValue - activePrincipal;

  res.render('dashboard/index', {
    pageTitle: 'Dashboard',
    wallet,
    activeInvestments,
    recentTransactions,
    totalInvested: Number(totalInvested._sum.amount || 0),
    currentValue,
    returnsEarned,
  });
}
