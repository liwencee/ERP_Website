import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/database';
import { generateReferralCode, generateRef } from '../../utils/helpers';
import * as emailService from '../../services/email.service';
import * as investmentService from '../../services/investment.service';
import { logAudit } from '../../services/audit.service';

export async function index(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const search = (req.query.search as string) || '';
  const roleFilter = (req.query.role as string) || '';
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: any = search
    ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
        ],
      }
    : {};
  if (roleFilter) where.role = roleFilter;

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.user.count({ where }),
  ]);

  res.render('admin/users/index', {
    pageTitle: 'Users',
    users,
    page,
    totalPages: Math.ceil(total / limit),
    search,
    roleFilter,
  });
}

export async function show(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      wallet: true,
      investments: {
        include: { plan: { include: { tenures: { orderBy: { sortOrder: 'asc' } } } }, tenure: true },
        orderBy: { createdAt: 'desc' },
      },
      transactions: { orderBy: { createdAt: 'desc' }, take: 10 },
      documents: true,
    },
  });

  if (!user) {
    req.flash('error', 'User not found.');
    res.redirect('/admin/users');
    return;
  }

  const referralCount = await prisma.user.count({ where: { referredBy: user.id } });

  const investedAgg = await prisma.userInvestment.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  const totalInvested = Number(investedAgg._sum.amount ?? 0);

  res.render('admin/users/show', { pageTitle: `User: ${user.firstName}`, profileUser: user, referralCount, totalInvested });
}

export async function reviewKyc(req: Request, res: Response): Promise<void> {
  const { action } = req.body;
  const userId = req.params.id;

  const kycStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
  await prisma.user.update({ where: { id: userId }, data: { kycStatus } });

  await prisma.notification.create({
    data: {
      userId,
      title: `KYC ${kycStatus === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: kycStatus === 'APPROVED'
        ? 'Your identity has been verified. You can now access all platform features.'
        : 'Your KYC documents were rejected. Please upload clearer documents.',
    },
  });

  await logAudit(req, 'KYC_REVIEW', { targetType: 'User', targetId: userId, detail: kycStatus });
  req.flash('success', `KYC ${kycStatus.toLowerCase()} for user.`);
  res.redirect(`/admin/users/${userId}`);
}

export async function toggleStatus(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) { res.redirect('/admin/users'); return; }

  const status = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  await prisma.user.update({ where: { id: user.id }, data: { status } });

  await logAudit(req, 'USER_STATUS', { targetType: 'User', targetId: user.id, detail: status });
  req.flash('success', `User account ${status.toLowerCase()}.`);
  res.redirect(`/admin/users/${user.id}`);
}

// Force-logout a user by incrementing sessionVersion
export async function forceLogout(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) { res.redirect('/admin/users'); return; }

  await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Session Ended',
      message: 'Your session has been ended by an administrator. Please log in again.',
    },
  });

  await logAudit(req, 'USER_FORCE_LOGOUT', { targetType: 'User', targetId: user.id });
  req.flash('success', `User ${user.firstName} has been logged out.`);
  res.redirect(`/admin/users/${user.id}`);
}

// Create staff account (super admin only)
export function createStaffGet(req: Request, res: Response): void {
  res.render('admin/users/create-staff', { pageTitle: 'Create Staff Account', errors: [] });
}

export async function createStaffPost(req: Request, res: Response): Promise<void> {
  const { firstName, lastName, email, phone, password } = req.body;
  const errors: string[] = [];

  if (!firstName || !lastName || !email || !password) errors.push('All fields are required.');
  if (password && password.length < 8) errors.push('Password must be at least 8 characters.');

  if (errors.length) {
    res.render('admin/users/create-staff', { pageTitle: 'Create Staff Account', errors });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    res.render('admin/users/create-staff', { pageTitle: 'Create Staff Account', errors: ['Email already in use.'] });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  let referralCode = generateReferralCode();
  let codeExists = await prisma.user.findUnique({ where: { referralCode } });
  while (codeExists) {
    referralCode = generateReferralCode();
    codeExists = await prisma.user.findUnique({ where: { referralCode } });
  }

  await prisma.user.create({
    data: {
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone: phone || null,
      password: hash,
      role: 'STAFF',
      emailVerified: true,
      referralCode,
      wallet: { create: { balance: 0 } },
    },
  });

  await logAudit(req, 'STAFF_CREATE', { targetType: 'User', detail: email.toLowerCase() });
  req.flash('success', `Staff account created for ${firstName} ${lastName}.`);
  res.redirect('/admin/users');
}

// ─── Manual Wallet Credit ─────────────────────────────────────────────────────
// Allows admin to manually credit a user's wallet when auto top-up fails.
export async function creditWallet(req: Request, res: Response): Promise<void> {
  const userId = req.params.id;
  const amount = parseFloat(req.body.amount);
  const note = (req.body.note as string)?.trim() || 'Manual top-up by admin';

  if (!amount || amount < 100) {
    req.flash('error', 'Minimum credit amount is ₦100.');
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  // Optional payment date — lets an admin record money a user paid earlier (e.g.
  // on the previous platform) against its real date. Blank = dated today. The
  // wallet is credited NOW either way; only the transaction record is backdated.
  let creditedAt: Date | null = null;
  const creditDateRaw = (req.body.creditDate as string)?.trim();
  if (creditDateRaw) {
    const parsed = new Date(creditDateRaw);
    if (isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
      req.flash('error', 'Payment date is invalid or in the future.');
      res.redirect(`/admin/users/${userId}`);
      return;
    }
    creditedAt = parsed;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user) {
    req.flash('error', 'User not found.');
    res.redirect('/admin/users');
    return;
  }

  if (!user.wallet) {
    req.flash('error', 'User has no wallet — cannot credit.');
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  const reference = generateRef('MAN');
  const adminName = req.session.userName || 'Admin';

  await prisma.$transaction([
    // Credit the wallet
    prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    }),
    // Create a confirmed DEPOSIT transaction record (optionally backdated)
    prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount,
        status: 'CONFIRMED',
        reference,
        paymentMethod: 'BANK_TRANSFER',
        description: `Manual top-up by ${adminName} — ${note}`,
        ...(creditedAt ? { createdAt: creditedAt } : {}),
      },
    }),
    // Notify the user
    prisma.notification.create({
      data: {
        userId,
        title: 'Wallet Credited',
        message: `₦${amount.toLocaleString()} has been manually credited to your wallet by our team. Reference: ${reference}.`,
      },
    }),
  ]);

  // Send email confirmation silently
  try {
    await emailService.sendDepositConfirmed(user.email, user.firstName, amount, reference);
  } catch { /* silent */ }

  const dateNote = creditedAt ? ` dated ${creditedAt.toISOString().slice(0, 10)}` : '';
  await logAudit(req, 'WALLET_CREDIT', { targetType: 'User', targetId: userId, detail: `₦${amount.toLocaleString()}${dateNote} — ${note} (ref ${reference})` });
  req.flash('success', `₦${amount.toLocaleString()} successfully credited to ${user.firstName} ${user.lastName}'s wallet${dateNote}. Ref: ${reference}`);
  res.redirect(`/admin/users/${userId}`);
}

// ─── Admin Wallet Debit (Reversal) ───────────────────────────────────────────
export async function debitWallet(req: Request, res: Response): Promise<void> {
  const userId = req.params.id;
  const amount = parseFloat(req.body.amount);
  const note = (req.body.note as string)?.trim() || 'Reversal by admin';

  if (!amount || amount < 100) {
    req.flash('error', 'Minimum debit amount is ₦100.');
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user) {
    req.flash('error', 'User not found.');
    res.redirect('/admin/users');
    return;
  }

  if (!user.wallet) {
    req.flash('error', 'User has no wallet — cannot debit.');
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  if (Number(user.wallet.balance) < amount) {
    req.flash('error', `Insufficient balance. User only has ₦${Number(user.wallet.balance).toLocaleString()}.`);
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  const reference = generateRef('REV');
  const adminName = req.session.userName || 'Admin';

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: 'REVERSAL',
        amount,
        status: 'CONFIRMED',
        reference,
        description: `Reversed by ${adminName} — ${note}`,
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        title: 'Wallet Reversed',
        message: `₦${amount.toLocaleString()} has been reversed from your wallet. Reason: ${note}. Reference: ${reference}.`,
      },
    }),
  ]);

  await logAudit(req, 'WALLET_REVERSAL', { targetType: 'User', targetId: userId, detail: `₦${amount.toLocaleString()} — ${note} (ref ${reference})` });
  req.flash('success', `₦${amount.toLocaleString()} successfully reversed from ${user.firstName} ${user.lastName}'s wallet. Ref: ${reference}`);
  res.redirect(`/admin/users/${userId}`);
}

// ─── Delete User (ADMIN only) ──────────────────────────────────────────────────
// Permanently removes a user and ALL associated records (wallet, transactions,
// investments, KYC documents, notifications). Irreversible. The AuditLog entry
// survives (it has no FK to User) so the deletion itself stays on record.
// Guards: cannot delete yourself, cannot delete another ADMIN, and the admin
// must re-type the user's email as confirmation.
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const targetId = req.params.id;
  const actingId = req.session.userId;

  if (targetId === actingId) {
    req.flash('error', 'You cannot delete your own account.');
    res.redirect(`/admin/users/${targetId}`);
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    req.flash('error', 'User not found.');
    res.redirect('/admin/users');
    return;
  }

  if (target.role === 'ADMIN') {
    req.flash('error', 'Administrator accounts cannot be deleted.');
    res.redirect(`/admin/users/${targetId}`);
    return;
  }

  // Typed confirmation must match the target email exactly.
  const typed = String(req.body.confirmEmail || '').trim().toLowerCase();
  if (typed !== target.email.toLowerCase()) {
    req.flash('error', 'Confirmation email did not match — user was NOT deleted.');
    res.redirect(`/admin/users/${targetId}`);
    return;
  }

  // Record the deletion BEFORE the row disappears.
  await logAudit(req, 'USER_DELETE', {
    targetType: 'User',
    targetId,
    detail: `${target.email} (${target.firstName} ${target.lastName})`,
  });

  // Remove dependents first, then the user — explicit and order-safe regardless
  // of the live DB's cascade configuration (transactions reference investments,
  // so they must go first).
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId: targetId } }),
    prisma.userInvestment.deleteMany({ where: { userId: targetId } }),
    prisma.document.deleteMany({ where: { userId: targetId } }),
    prisma.notification.deleteMany({ where: { userId: targetId } }),
    prisma.wallet.deleteMany({ where: { userId: targetId } }),
    prisma.user.delete({ where: { id: targetId } }),
  ]);

  req.flash('success', `${target.firstName} ${target.lastName} (${target.email}) and all associated records have been permanently deleted.`);
  res.redirect('/admin/users');
}

// Render the printable account statement for a given user (admin view).
export async function report(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      wallet: true,
      investments: { include: { plan: true, tenure: true }, orderBy: { createdAt: 'desc' } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!user) {
    req.flash('error', 'User not found.');
    res.redirect('/admin/users');
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

// Admin changes the tenure of a specific investment belonging to a user.
export async function changeInvestmentTenure(req: Request, res: Response): Promise<void> {
  const { userId, id } = req.params;
  const { tenureId } = req.body;

  const investment = await prisma.userInvestment.findUnique({ where: { id } });
  if (!investment || investment.userId !== userId) {
    req.flash('error', 'Investment not found for this user.');
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  try {
    const result = await investmentService.changeTenure(id, tenureId);
    await logAudit(req, 'INVESTMENT_TENURE_CHANGE', {
      targetType: 'UserInvestment',
      targetId: id,
      detail: `${result.oldTenureLabel ?? '—'} → ${result.newTenureLabel} (expected ₦${result.expectedReturn.toLocaleString()}, matures ${result.maturityDate.toISOString().slice(0, 10)})`,
    });
    req.flash('success', `Tenure changed to ${result.newTenureLabel} for this investment.`);
  } catch (err) {
    req.flash('error', err instanceof Error ? err.message : 'Could not change tenure.');
  }
  res.redirect(`/admin/users/${userId}`);
}
