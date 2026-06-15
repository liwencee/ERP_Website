import { Request, Response } from 'express';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import * as contactService from '../../services/contact.service';

const PLAN_ORDER = ['Silver', 'Bronze', 'Gold', 'Diamond', 'Save Future', 'Fixed Deposit', 'Trading', 'Dollar', 'Real Estate'];

function sortPlans<T extends { name: string }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const ai = PLAN_ORDER.findIndex(k => a.name.includes(k));
    const bi = PLAN_ORDER.findIndex(k => b.name.includes(k));
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[–—]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const DISPLAY_NAMES: Record<string, string> = {
  'Silver – My Investment SPlus': 'Silver – Package',
  'Bronze – My Investment BPlus': 'Bronze – Package',
  'Gold – My Investment GPlus': 'Gold – Package',
  'Diamond – My Investment DPlus': 'Diamond – Package',
  'Save Future – My Savings Plan': 'Savings – Plan',
  'Fixed Deposit – Stop Unnecessary Spending': 'Fixed Deposit',
  'Trading Investment – Earn Faster': 'Trading Investment – Package',
  'Dollar Investment – Foreign Currency': 'Dollar – Package',
};

function displayName(name: string): string {
  return DISPLAY_NAMES[name] || name;
}

export async function home(req: Request, res: Response): Promise<void> {
  const allPlans = await prisma.investmentPlan.findMany({
    where: { status: 'ACTIVE' },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  const plans = sortPlans(allPlans);
  // Featured cards: all plans shown (Savings, Silver, Bronze, Gold, Diamond, Fixed Deposit, Trading, Dollar, Real Estate)
  const featuredPlans = plans;
  res.render('public/index', { title: 'Home', plans, featuredPlans });
}

export function about(_req: Request, res: Response): void {
  res.render('public/about', { title: 'About Us' });
}

export function services(_req: Request, res: Response): void {
  res.render('public/services', { title: 'Investment Services' });
}

export async function investmentPlans(_req: Request, res: Response): Promise<void> {
  const raw = await prisma.investmentPlan.findMany({
    where: { status: 'ACTIVE' },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  const plans = sortPlans(raw).map(plan => ({ ...plan, slug: slugify(plan.name), displayName: displayName(plan.name) }));
  res.render('public/investment-plans', { title: 'Investment Plans', plans });
}

export async function investmentPlanDetail(req: Request, res: Response): Promise<void> {
  const raw = await prisma.investmentPlan.findMany({
    where: { status: 'ACTIVE' },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  const plans = sortPlans(raw);
  const plan = plans.find(p => slugify(p.name) === req.params.slug);

  if (!plan) {
    res.status(404).render('errors/404', { title: 'Plan Not Found' });
    return;
  }

  if (plan.type === 'REAL_ESTATE') {
    res.redirect('/real-estate');
    return;
  }

  const planWithDisplay = { ...plan, displayName: displayName(plan.name) };
  res.render('public/investment-plan-detail', { title: planWithDisplay.displayName, plan: planWithDisplay });
}

export async function realEstate(_req: Request, res: Response): Promise<void> {
  const properties = await prisma.realEstateProperty.findMany({
    where: { status: 'AVAILABLE' },
    orderBy: { sortOrder: 'asc' },
  });
  res.render('public/real-estate', { title: 'Real Estate', properties });
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

export function privacy(_req: Request, res: Response): void {
  res.render('public/privacy', { title: 'Privacy Policy' });
}

export function terms(_req: Request, res: Response): void {
  res.render('public/terms', { title: 'Terms and Conditions' });
}

export async function contactPost(req: Request, res: Response): Promise<void> {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const phone = String(req.body.phone || '').trim();
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !emailValid || !message) {
    req.flash('error', 'Please provide your name, a valid email address, and a message.');
    res.redirect('/contact');
    return;
  }
  if (name.length > 200 || message.length > 5000) {
    req.flash('error', 'Your message is too long. Please shorten it and try again.');
    res.redirect('/contact');
    return;
  }

  try {
    await contactService.sendContactEmail({ name, email, phone, subject, message });
    req.flash('success', 'Thank you for your message. We will get back to you shortly.');
  } catch (err) {
    logger.error(`Contact form email failed: ${(err as Error).message}`);
    req.flash('error', 'Sorry, we could not send your message right now. Please email us directly at info@epraaccess.com.');
  }
  res.redirect('/contact');
}
