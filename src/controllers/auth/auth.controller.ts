import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import prisma from '../../config/database';
import { generateToken, generateReferralCode } from '../../utils/helpers';
import * as emailService from '../../services/email.service';

// How long a verification link stays valid.
const VERIFY_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Role-based landing page after authentication.
function homeFor(role: string): string {
  return role === 'ADMIN' || role === 'STAFF' ? '/admin' : '/dashboard';
}

// Establishes an authenticated session: regenerates the session id (anti-fixation),
// copies the user identity in, then persists the store BEFORE the caller redirects
// (so the redirect can't outrun the session write). Shared by the login handler
// and the post-verification auto-login.
function startSession(
  req: Request,
  user: { id: string; role: string; email: string; firstName: string; lastName: string; sessionVersion: number },
  onError: () => void,
  onSuccess: () => void,
): void {
  req.session.regenerate((regenErr) => {
    if (regenErr) { onError(); return; }
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userEmail = user.email;
    req.session.userName = `${user.firstName} ${user.lastName}`;
    req.session.sessionVersion = user.sessionVersion;
    req.session.save((err) => {
      if (err) { onError(); return; }
      onSuccess();
    });
  });
}

// ─── Register ────────────────────────────────────────────────────────────────

export function registerGet(req: Request, res: Response): void {
  const ref = req.query.ref as string || '';
  res.render('auth/register', { title: 'Create Account', errors: [], refCode: ref });
}

export async function registerPost(req: Request, res: Response): Promise<void> {
  const errors: string[] = [];
  const { firstName, lastName, email, phone, password, confirmPassword, refCode,
          dateOfBirth, gender, address, state, city } = req.body;

  if (!firstName || !lastName || !email || !phone || !password) errors.push('All fields are required.');
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
  const emailTokenExp = new Date(Date.now() + VERIFY_TTL_MS);

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
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      gender: gender || null,
      address: address || null,
      state: state || null,
      city: city || null,
      password: hash,
      emailToken,
      emailTokenExp,
      referralCode,
      referredBy: referredById || null,
      emailVerified: false,  // must confirm via the emailed link before logging in
      wallet: { create: { balance: 0 } },
    },
  });

  // Remember who just registered so the verify-notice page and the resend form
  // work without ever putting the email address in a URL.
  req.session.pendingVerifyEmail = user.email;

  // Send the verification link. If it fails the account still exists (unverified)
  // and the user can request a fresh link from the notice page.
  try {
    await emailService.sendVerificationEmail(user.email, user.firstName, emailToken);
    req.flash('success', 'Account created! Check your inbox for the verification link — it expires in 10 minutes.');
  } catch (err) {
    console.error('Verification email failed to send:', err);
    req.flash('error', 'Account created, but the verification email could not be sent. Please use "Resend" below.');
  }

  res.redirect('/auth/verify-notice');
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

  // Block sign-in until the email is confirmed. Stash the address so the notice
  // page can offer a one-click resend without exposing it in the URL.
  if (!user.emailVerified) {
    req.session.pendingVerifyEmail = user.email;
    req.flash('error', 'Please verify your email before logging in — we can resend the link below.');
    res.redirect('/auth/verify-notice');
    return;
  }

  if (user.status === 'SUSPENDED') {
    req.flash('error', 'Your account has been suspended. Please contact support.');
    res.redirect('/auth/login');
    return;
  }

  // Establish the authenticated session, then send them to their home page.
  startSession(
    req,
    user,
    () => {
      req.flash('error', 'Login failed. Please try again.');
      res.redirect('/auth/login');
    },
    () => res.redirect(homeFor(user.role)),
  );
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

  // No match: link is wrong or already consumed (we null the token on success).
  if (!user) {
    req.flash('error', 'This verification link is invalid or has already been used. Please log in or register again.');
    res.redirect('/auth/login');
    return;
  }

  // Expired link: offer a fresh one rather than dead-ending.
  if (!user.emailTokenExp || user.emailTokenExp.getTime() < Date.now()) {
    req.session.pendingVerifyEmail = user.email;
    req.flash('error', 'This verification link has expired. Request a new one below — links last 10 minutes.');
    res.redirect('/auth/verify-notice');
    return;
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailToken: null, emailTokenExp: null },
  });

  // Verified — log them straight in and drop them on their dashboard.
  startSession(
    req,
    verified,
    () => {
      req.flash('success', 'Email verified! Please log in.');
      res.redirect('/auth/login');
    },
    () => {
      req.flash('success', 'Email verified — welcome to EPR Access!');
      res.redirect(homeFor(verified.role));
    },
  );
}

// ─── Verification Notice / Resend ──────────────────────────────────────────────

export function verifyNoticeGet(req: Request, res: Response): void {
  res.render('auth/verify-notice', {
    title: 'Verify Your Email',
    email: req.session.pendingVerifyEmail || '',
  });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const email = String(req.body.email || req.session.pendingVerifyEmail || '')
    .toLowerCase()
    .trim();

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) {
      const emailToken = generateToken();
      const emailTokenExp = new Date(Date.now() + VERIFY_TTL_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: { emailToken, emailTokenExp },
      });
      req.session.pendingVerifyEmail = user.email;
      try {
        await emailService.sendVerificationEmail(user.email, user.firstName, emailToken);
      } catch (err) {
        console.error('Resend verification email failed:', err);
      }
    }
  }

  // Always the same message — never reveal whether an account exists or its
  // verification state (avoids user enumeration).
  req.flash('success', 'If that account still needs verifying, a new link is on its way. It expires in 10 minutes.');
  res.redirect('/auth/verify-notice');
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
