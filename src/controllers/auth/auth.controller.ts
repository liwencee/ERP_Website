import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import prisma from '../../config/database';
import { generateToken, generateReferralCode } from '../../utils/helpers';
import * as emailService from '../../services/email.service';

// ─── Register ────────────────────────────────────────────────────────────────

export function registerGet(req: Request, res: Response): void {
  const ref = req.query.ref as string || '';
  res.render('auth/register', { title: 'Create Account', errors: [], refCode: ref });
}

export async function registerPost(req: Request, res: Response): Promise<void> {
  const errors: string[] = [];
  const { firstName, lastName, email, phone, password, confirmPassword, refCode,
          dateOfBirth, gender, address, state, city } = req.body;

  if (!firstName || !lastName || !email || !password) errors.push('All fields are required.');
  if (password !== confirmPassword) errors.push('Passwords do not match.');
  if (password && password.length < 8) errors.push('Password must be at least 8 characters.');

  if (errors.length) {
    res.render('auth/register', { title: 'Create Account', errors, body: req.body });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    res.render('auth/register', { title: 'Create Account', errors: ['An account with this email already exists.'], body: req.body });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const emailToken = generateToken();

  // Validate referral code if provided
  let referredById: string | null = null;
  if (refCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: refCode.toUpperCase() } });
    if (referrer) referredById = referrer.id;
  }

  // Generate a unique referral code
  let referralCode = generateReferralCode();
  let codeExists = await prisma.user.findUnique({ where: { referralCode } });
  while (codeExists) {
    referralCode = generateReferralCode();
    codeExists = await prisma.user.findUnique({ where: { referralCode } });
  }

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone: phone || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender || null,
      address: address || null,
      state: state || null,
      city: city || null,
      password: hash,
      emailToken,
      referralCode,
      referredBy: referredById || null,
      emailVerified: true,  // auto-verify so users can log in immediately
      wallet: { create: { balance: 0 } },
    },
  });

  // Welcome email (non-blocking — registration succeeds even if email fails)
  try {
    await emailService.sendVerificationEmail(user.email, user.firstName, emailToken);
  } catch {
    // silent
  }

  req.flash('success', 'Account created successfully! You can now log in.');
  res.redirect('/auth/login');
}

// ─── Login ───────────────────────────────────────────────────────────────────

export function loginGet(req: Request, res: Response): void {
  res.render('auth/login', { title: 'Login' });
}

export async function loginPost(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash('error', 'Invalid email or password.');
    res.redirect('/auth/login');
    return;
  }

  // Email verification not required — anyone who registers can log in immediately.

  if (user.status === 'SUSPENDED') {
    req.flash('error', 'Your account has been suspended. Please contact support.');
    res.redirect('/auth/login');
    return;
  }

  // Regenerate the session on login to prevent session fixation — a new session
  // ID is issued so any value an attacker may have planted pre-login is discarded.
  req.session.regenerate((regenErr) => {
    if (regenErr) {
      req.flash('error', 'Login failed. Please try again.');
      res.redirect('/auth/login');
      return;
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userEmail = user.email;
    req.session.userName = `${user.firstName} ${user.lastName}`;
    req.session.sessionVersion = user.sessionVersion;

    // Explicitly save the session before redirecting — avoids a race where the
    // redirect fires before the new session is persisted to the store.
    req.session.save((err) => {
      if (err) {
        req.flash('error', 'Login failed. Please try again.');
        res.redirect('/auth/login');
        return;
      }
      if (user.role === 'ADMIN' || user.role === 'STAFF') {
        res.redirect('/admin');
      } else {
        res.redirect('/dashboard');
      }
    });
  });
}

// ─── Logout ──────────────────────────────────────────────────────────────────

export function logout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.redirect('/');
  });
}

// ─── Email Verification ───────────────────────────────────────────────────────

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const user = await prisma.user.findFirst({ where: { emailToken: token } });

  if (!user) {
    req.flash('error', 'Invalid or expired verification link.');
    res.redirect('/auth/login');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailToken: null },
  });

  req.flash('success', 'Email verified! You can now log in.');
  res.redirect('/auth/login');
}

// ─── Forgot Password ─────────────────────────────────────────────────────────

export function forgotGet(req: Request, res: Response): void {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
}

export async function forgotPost(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (user) {
    const token = generateToken();
    const exp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExp: exp },
    });
    try {
      await emailService.sendPasswordReset(user.email, user.firstName, token);
    } catch { /* silent */ }
  }

  // Always show the same message to avoid user enumeration
  req.flash('info', 'If that email exists, a reset link has been sent.');
  res.redirect('/auth/forgot-password');
}

// ─── Reset Password ───────────────────────────────────────────────────────────

export async function resetGet(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExp: { gt: new Date() } },
  });

  if (!user) {
    req.flash('error', 'This reset link is invalid or has expired.');
    res.redirect('/auth/forgot-password');
    return;
  }

  res.render('auth/reset-password', { title: 'Reset Password', token });
}

export async function resetPost(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (password !== confirmPassword || password.length < 8) {
    req.flash('error', 'Passwords do not match or are too short.');
    res.redirect(`/auth/reset-password/${token}`);
    return;
  }

  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExp: { gt: new Date() } },
  });

  if (!user) {
    req.flash('error', 'This reset link is invalid or has expired.');
    res.redirect('/auth/forgot-password');
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, resetToken: null, resetTokenExp: null },
  });

  req.flash('success', 'Password reset successfully. You can now log in.');
  res.redirect('/auth/login');
}
