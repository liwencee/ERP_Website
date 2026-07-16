import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function statement(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
      investments: { include: { plan: true, tenure: true }, orderBy: { createdAt: 'desc' } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!user) {
    req.flash('error', 'Account not found.');
    res.redirect('/dashboard');
    return;
  }

  const totalInvested = user.investments.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpected = user.investments.reduce((s, i) => s + Number(i.expectedReturn), 0);

  res.render('reports/statement', {
    profileUser: user,
    totalInvested,
    totalExpected,
    generatedAt: new Date(),
  });
}
