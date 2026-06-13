import { Request, Response } from 'express';
import prisma from '../../config/database';
import { logAudit } from '../../services/audit.service';

export async function index(_req: Request, res: Response): Promise<void> {
  const plans = await prisma.investmentPlan.findMany({ orderBy: { createdAt: 'desc' } });
  res.render('admin/plans/index', { pageTitle: 'Investment Plans', plans });
}

export function newGet(_req: Request, res: Response): void {
  res.render('admin/plans/form', { pageTitle: 'New Plan', plan: null });
}

export async function newPost(req: Request, res: Response): Promise<void> {
  const { name, type, description, minAmount, maxAmount, returnRate, duration } = req.body;
  await prisma.investmentPlan.create({
    data: {
      name,
      type,
      description,
      minAmount: parseFloat(minAmount),
      maxAmount: maxAmount ? parseFloat(maxAmount) : null,
      returnRate: parseFloat(returnRate),
      duration: parseInt(duration),
    },
  });
  await logAudit(req, 'PLAN_CREATE', { targetType: 'InvestmentPlan', detail: name });
  req.flash('success', 'Investment plan created.');
  res.redirect('/admin/plans');
}

export async function editGet(req: Request, res: Response): Promise<void> {
  const plan = await prisma.investmentPlan.findUnique({ where: { id: req.params.id } });
  if (!plan) { res.redirect('/admin/plans'); return; }
  res.render('admin/plans/form', { pageTitle: 'Edit Plan', plan });
}

export async function editPost(req: Request, res: Response): Promise<void> {
  const { name, type, description, minAmount, maxAmount, returnRate, duration, status } = req.body;
  await prisma.investmentPlan.update({
    where: { id: req.params.id },
    data: {
      name,
      type,
      description,
      minAmount: parseFloat(minAmount),
      maxAmount: maxAmount ? parseFloat(maxAmount) : null,
      returnRate: parseFloat(returnRate),
      duration: parseInt(duration),
      status,
    },
  });
  await logAudit(req, 'PLAN_UPDATE', { targetType: 'InvestmentPlan', targetId: req.params.id, detail: name });
  req.flash('success', 'Plan updated.');
  res.redirect('/admin/plans');
}

export async function deletePlan(req: Request, res: Response): Promise<void> {
  await prisma.investmentPlan.update({
    where: { id: req.params.id },
    data: { status: 'CLOSED' },
  });
  await logAudit(req, 'PLAN_CLOSE', { targetType: 'InvestmentPlan', targetId: req.params.id });
  req.flash('success', 'Plan closed.');
  res.redirect('/admin/plans');
}
