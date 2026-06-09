import { Request, Response } from 'express';
import prisma from '../../config/database';

const PLAN_ORDER = ['Silver', 'Bronze', 'Gold', 'Diamond', 'Save Future', 'Fixed Deposit', 'Trading', 'Dollar', 'Real Estate'];

function sortPlans<T extends { name: string }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const ai = PLAN_ORDER.findIndex(k => a.name.includes(k));
    const bi = PLAN_ORDER.findIndex(k => b.name.includes(k));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

export async function home(req: Request, res: Response): Promise<void> {
  const allPlans = await prisma.investmentPlan.findMany({
    where: { status: 'ACTIVE' },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  const plans = sortPlans(allPlans);
  // Featured cards: Silver, Bronze, Fixed Deposit, Dollar, Real Estate
  const featuredTypes = ['Silver', 'Bronze', 'Fixed Deposit', 'Dollar', 'Real Estate'];
  const featuredPlans = plans.filter(p => featuredTypes.some(t => p.name.includes(t)));
  res.render('public/index', { title: 'Home', plans, featuredPlans });
}

export function about(_req: Request, res: Response): void {
  res.render('public/about', { title: 'About Us' });
}

export async function services(_req: Request, res: Response): Promise<void> {
  const [raw, properties] = await Promise.all([
    prisma.investmentPlan.findMany({
      where: { status: 'ACTIVE' },
      include: { tenures: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.realEstateProperty.findMany({
      where: { status: 'AVAILABLE' },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);
  const plans = sortPlans(raw);
  res.render('public/services', { title: 'Investment Services', plans, properties });
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
