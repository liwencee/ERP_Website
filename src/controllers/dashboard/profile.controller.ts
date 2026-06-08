import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/database';

export async function profileGet(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  // Count referrals
  const referralCount = await prisma.user.count({ where: { referredBy: req.session.userId! } });
  res.render('dashboard/profile', { pageTitle: 'Profile', profileUser: user, referralCount });
}

export async function profilePost(req: Request, res: Response): Promise<void> {
  const { firstName, lastName, phone } = req.body;
  await prisma.user.update({
    where: { id: req.session.userId! },
    data: { firstName, lastName, phone: phone || null },
  });
  req.session.userName = `${firstName} ${lastName}`;
  req.flash('success', 'Profile updated successfully.');
  res.redirect('/dashboard/profile');
}

export async function avatarPost(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    req.flash('error', 'Please select an image to upload.');
    res.redirect('/dashboard/profile');
    return;
  }
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  await prisma.user.update({
    where: { id: req.session.userId! },
    data: { avatar: avatarUrl },
  });
  req.flash('success', 'Profile photo updated.');
  res.redirect('/dashboard/profile');
}

export async function passwordPost(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword || newPassword.length < 8) {
    req.flash('error', 'Passwords do not match or are too short.');
    res.redirect('/dashboard/profile');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    req.flash('error', 'Current password is incorrect.');
    res.redirect('/dashboard/profile');
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  req.flash('success', 'Password changed successfully.');
  res.redirect('/dashboard/profile');
}

export async function kycGet(req: Request, res: Response): Promise<void> {
  const documents = await prisma.document.findMany({
    where: { userId: req.session.userId! },
    orderBy: { createdAt: 'desc' },
  });
  res.render('dashboard/kyc', { pageTitle: 'KYC Verification', documents });
}

export async function kycPost(req: Request, res: Response): Promise<void> {
  const { documentType } = req.body;
  if (!req.file) {
    req.flash('error', 'Please upload a document.');
    res.redirect('/dashboard/kyc');
    return;
  }

  await prisma.document.create({
    data: {
      userId: req.session.userId!,
      type: documentType,
      url: `/uploads/${req.file.filename}`,
      status: 'PENDING',
    },
  });

  await prisma.user.update({
    where: { id: req.session.userId! },
    data: { kycStatus: 'SUBMITTED' },
  });

  req.flash('success', 'Document uploaded successfully. We will review it shortly.');
  res.redirect('/dashboard/kyc');
}
