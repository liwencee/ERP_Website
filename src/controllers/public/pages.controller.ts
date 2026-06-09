import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function home(req: Request, res: Response): Promise<void> {
  const plans = await prisma.investmentPlan.findMany({
    where: { status: 'ACTIVE' },
    take: 6,
    orderBy: { createdAt: 'desc' },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  res.render('public/index', { title: 'Home', plans });
}

export function about(_req: Request, res: Response): void {
  res.render('public/about', { title: 'About Us' });
}

export async function services(_req: Request, res: Response): Promise<void> {
  const plans = await prisma.investmentPlan.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { type: 'asc' },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  res.render('public/services', { title: 'Investment Services', plans });
}

export function team(_req: Request, res: Response): void {
  res.render('public/team', { title: 'Our Team' });
}

export function compliance(_req: Request, res: Response): void {
  res.render('public/compliance', { title: 'Compliance & Legal' });
}

export function contactGet(_req: Request, res: Response): void {
  res.render('public/contact', { title: 'Contact Us' });
}

export function contactPost(req: Request, res: Response): void {
  // In production wire up to an email service
  req.flash('success', 'Thank you for your message. We will get back to you shortly.');
  res.redirect('/contact');
}
