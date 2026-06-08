import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/database';
import { generateReferralCode } from '../../utils/helpers';

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
      investments: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
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
  res.render('admin/users/show', { pageTitle: `User: ${user.firstName}`, profileUser: user, referralCount });
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

  req.flash('success', `KYC ${kycStatus.toLowerCase()} for user.`);
  res.redirect(`/admin/users/${userId}`);
}

export async function toggleStatus(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) { res.redirect('/admin/users'); return; }

  const status = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  await prisma.user.update({ where: { id: user.id }, data: { status } });

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

  req.flash('success', `Staff account created for ${firstName} ${lastName}.`);
  res.redirect('/admin/users');
}
