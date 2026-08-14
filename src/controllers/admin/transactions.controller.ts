import { Request, Response } from 'express';
import prisma from '../../config/database';
import * as emailService from '../../services/email.service';
import { logAudit } from '../../services/audit.service';

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

// ─── Confirm ─────────────────────────────────────────────────────────────────
// Only DEPOSIT transactions credit the wallet.
// Confirming a WITHDRAWAL means it has been paid out — just mark confirmed,
// the wallet was already debited when the request was made.
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
    // Reject a future date — it would sort above genuinely recent transactions
    // and stay there until the mistaken date actually arrives.
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      updateData.createdAt = parsed;
    }
  }

  const confirmed = await prisma.$transaction(async (txClient) => {
    // Atomic, race-safe: only applies while still PENDING, so a double-click
    // or duplicate submission can't confirm (and credit) the same transaction twice.
    const updated = await txClient.transaction.updateMany({
      where: { id: tx.id, status: 'PENDING' },
      data: updateData,
    });
    if (updated.count === 0) return false;

    if (tx.type === 'DEPOSIT') {
      await txClient.wallet.update({
        where: { userId: tx.userId },
        data: { balance: { increment: tx.amount } },
      });
    }
    return true;
  });

  if (!confirmed) {
    req.flash('error', 'Transaction not found or already processed.');
    res.redirect('/admin/transactions');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });

  if (tx.type === 'DEPOSIT') {
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
      } catch { /* silent — don't block the admin action */ }
    }

    req.flash('success', 'Deposit confirmed and wallet credited.');

  } else if (tx.type === 'WITHDRAWAL') {
    // Wallet was already debited on request — confirm means payment has been sent
    if (user) {
      await prisma.notification.create({
        data: {
          userId: tx.userId,
          title: 'Withdrawal Processed',
          message: `Your withdrawal of ₦${Number(tx.amount).toLocaleString()} has been processed and sent to your bank account.`,
        },
      });
      try {
        await emailService.sendWithdrawalNotice(user.email, user.firstName, Number(tx.amount), 'Confirmed');
      } catch { /* silent */ }
    }

    req.flash('success', 'Withdrawal confirmed — payment marked as sent.');

  } else {
    // INVESTMENT / RETURN / BONUS — just mark confirmed, no wallet change
    req.flash('success', 'Transaction confirmed.');
  }

  await logAudit(req, 'TX_CONFIRM', { targetType: 'Transaction', targetId: tx.id, detail: `${tx.type} ₦${Number(tx.amount).toLocaleString()}` });
  res.redirect('/admin/transactions');
}

// ─── Reject ──────────────────────────────────────────────────────────────────
// Rejecting a WITHDRAWAL must refund the wallet (it was pre-debited).
// Rejecting a DEPOSIT just marks it rejected — wallet was never credited.
export async function reject(req: Request, res: Response): Promise<void> {
  const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!tx || tx.status !== 'PENDING') {
    req.flash('error', 'Transaction not found or already processed.');
    res.redirect('/admin/transactions');
    return;
  }

  const rejected = await prisma.$transaction(async (txClient) => {
    // Atomic, race-safe: only applies while still PENDING, so a double-click
    // or duplicate submission can't refund the same withdrawal twice.
    const updated = await txClient.transaction.updateMany({
      where: { id: tx.id, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    if (updated.count === 0) return false;

    if (tx.type === 'WITHDRAWAL') {
      // Refund: wallet was debited when the request was submitted
      await txClient.wallet.update({
        where: { userId: tx.userId },
        data: { balance: { increment: tx.amount } },
      });
    }
    return true;
  });

  if (!rejected) {
    req.flash('error', 'Transaction not found or already processed.');
    res.redirect('/admin/transactions');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });

  if (tx.type === 'WITHDRAWAL') {
    if (user) {
      await prisma.notification.create({
        data: {
          userId: tx.userId,
          title: 'Withdrawal Rejected',
          message: `Your withdrawal request of ₦${Number(tx.amount).toLocaleString()} was rejected and refunded to your wallet. Please contact support if you have questions.`,
        },
      });
      try {
        await emailService.sendWithdrawalNotice(user.email, user.firstName, Number(tx.amount), 'Rejected');
      } catch { /* silent */ }
    }

    req.flash('success', 'Withdrawal rejected and amount refunded to user wallet.');

  } else {
    // DEPOSIT rejected — wallet was never credited, no refund needed
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
  }

  await logAudit(req, 'TX_REJECT', { targetType: 'Transaction', targetId: tx.id, detail: `${tx.type} ₦${Number(tx.amount).toLocaleString()}` });
  res.redirect('/admin/transactions');
}

// ─── Backdate Investment ──────────────────────────────────────────────────────
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

  await logAudit(req, 'INVESTMENT_BACKDATE', { targetType: 'UserInvestment', targetId: investmentId, detail: `${startDate} → ${maturityDate}` });
  req.flash('success', 'Investment dates updated successfully.');
  res.redirect('/admin/investments');
}
