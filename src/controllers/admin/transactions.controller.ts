import { Request, Response } from 'express';
import prisma from '../../config/database';
import * as emailService from '../../services/email.service';

export async function index(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const type = (req.query.type as string) || '';
  const status = (req.query.status as string) || '';
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.render('admin/transactions/index', {
    pageTitle: 'Transactions',
    transactions,
    page,
    totalPages: Math.ceil(total / limit),
    typeFilter: type,
    statusFilter: status,
  });
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.status !== 'PENDING') {
    req.flash('error', 'Transaction not found or already processed.');
    res.redirect('/admin/transactions');
    return;
  }

  const { backdateDate } = req.body;
  const updateData: any = { status: 'CONFIRMED' };
  if (backdateDate) {
    const parsed = new Date(backdateDate);
    if (!isNaN(parsed.getTime())) {
      updateData.createdAt = parsed;
    }
  }

  await prisma.transaction.update({ where: { id: tx.id }, data: updateData });
  await prisma.wallet.update({
    where: { userId: tx.userId },
    data: { balance: { increment: tx.amount } },
  });

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });
  if (user) {
    await prisma.notification.create({
      data: {
        userId: tx.userId,
        title: 'Deposit Confirmed',
        message: `Your deposit of ₦${Number(tx.amount).toLocaleString()} has been confirmed and credited to your wallet.`,
      },
    });
    try {
      await emailService.sendDepositConfirmed(user.email, user.firstName, Number(tx.amount), tx.reference);
    } catch { /* silent */ }
  }

  req.flash('success', 'Transaction confirmed and wallet credited.');
  res.redirect('/admin/transactions');
}

export async function reject(req: Request, res: Response): Promise<void> {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.status !== 'PENDING') {
    req.flash('error', 'Transaction not found or already processed.');
    res.redirect('/admin/transactions');
    return;
  }

  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'REJECTED' } });

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });
  if (user) {
    await prisma.notification.create({
      data: {
        userId: tx.userId,
        title: 'Deposit Rejected',
        message: `Your deposit request of ₦${Number(tx.amount).toLocaleString()} has been rejected. Please contact support.`,
      },
    });
  }

  req.flash('success', 'Transaction rejected.');
  res.redirect('/admin/transactions');
}

// Backdate an existing confirmed investment (admin only)
export async function backdateInvestment(req: Request, res: Response): Promise<void> {
  const { investmentId, startDate, maturityDate } = req.body;
  if (!investmentId || !startDate || !maturityDate) {
    req.flash('error', 'Please provide investment ID, start date and maturity date.');
    res.redirect('/admin/investments');
    return;
  }

  const start = new Date(startDate);
  const maturity = new Date(maturityDate);

  if (isNaN(start.getTime()) || isNaN(maturity.getTime())) {
    req.flash('error', 'Invalid dates provided.');
    res.redirect('/admin/investments');
    return;
  }

  await prisma.userInvestment.update({
    where: { id: investmentId },
    data: { startDate: start, maturityDate: maturity },
  });

  req.flash('success', 'Investment dates updated successfully.');
  res.redirect('/admin/investments');
}
