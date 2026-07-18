import { Request, Response } from 'express';
import prisma from '../../config/database';
import * as investmentService from '../../services/investment.service';
import { logAudit } from '../../services/audit.service';

export async function index(req: Request, res: Response): Promise<void> {
  const requests = await prisma.tenureChangeRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      investment: { include: { user: true, plan: true, tenure: true } },
      requestedTenure: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  res.render('admin/tenure-requests/index', { pageTitle: 'Tenure Change Requests', requests });
}

export async function approve(req: Request, res: Response): Promise<void> {
  const request = await prisma.tenureChangeRequest.findUnique({
    where: { id: req.params.id },
    include: { requestedTenure: true },
  });
  if (!request || request.status !== 'PENDING') {
    req.flash('error', 'Request not found or already resolved.');
    res.redirect('/admin/tenure-requests');
    return;
  }

  try {
    const result = await investmentService.changeTenure(request.investmentId, request.requestedTenureId);
    await prisma.tenureChangeRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedById: req.session.userId, reviewedAt: new Date() },
    });
    await logAudit(req, 'TENURE_CHANGE_APPROVED', {
      targetType: 'UserInvestment',
      targetId: request.investmentId,
      detail: `${result.oldTenureLabel || 'none'} → ${result.newTenureLabel} (request ${request.id})`,
    });
    req.flash('success', `Approved. Tenure changed to ${result.newTenureLabel}.`);
  } catch (err) {
    req.flash('error', err instanceof Error ? err.message : 'Could not approve this request.');
  }
  res.redirect('/admin/tenure-requests');
}

export async function reject(req: Request, res: Response): Promise<void> {
  const note = String(req.body.note || '').trim();
  const request = await prisma.tenureChangeRequest.findUnique({ where: { id: req.params.id } });
  if (!request || request.status !== 'PENDING') {
    req.flash('error', 'Request not found or already resolved.');
    res.redirect('/admin/tenure-requests');
    return;
  }

  await prisma.tenureChangeRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', reviewedById: req.session.userId, reviewedAt: new Date(), reviewNote: note || null },
  });

  const investment = await prisma.userInvestment.findUnique({ where: { id: request.investmentId } });
  if (investment) {
    await prisma.notification.create({
      data: {
        userId: investment.userId,
        title: 'Tenure Change Request Rejected',
        message: note
          ? `Your tenure change request was not approved. Reason: ${note}`
          : 'Your tenure change request was not approved.',
      },
    });
  }

  await logAudit(req, 'TENURE_CHANGE_REJECTED', {
    targetType: 'UserInvestment',
    targetId: request.investmentId,
    detail: note || undefined,
  });

  req.flash('success', 'Request rejected.');
  res.redirect('/admin/tenure-requests');
}
