import { Request, Response } from 'express';
import prisma from '../../config/database';
import * as investmentService from '../../services/investment.service';
import * as emailService from '../../services/email.service';
import { USD_NGN_RATE, sortPlansByMenu } from '../../utils/helpers';

export async function index(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;

  const [rawPlans, myInvestments] = await Promise.all([
    prisma.investmentPlan.findMany({
      where: { status: 'ACTIVE' },
      include: { tenures: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.userInvestment.findMany({
      where: { userId },
      include: {
        plan: { include: { tenures: { orderBy: { sortOrder: 'asc' } } } },
        tenure: true,
        tenureChangeRequests: { where: { status: 'PENDING' }, include: { requestedTenure: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Order the plan cards to match the Investments menu dropdown.
  const plans = sortPlansByMenu(rawPlans);

  res.render('dashboard/investments', { pageTitle: 'Investments', plans, myInvestments });
}

export async function investGet(req: Request, res: Response): Promise<void> {
  const plan = await prisma.investmentPlan.findUnique({
    where: { id: req.params.planId },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!plan || plan.status !== 'ACTIVE') {
    req.flash('error', 'Investment plan not found.');
    res.redirect('/dashboard/investments');
    return;
  }
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.session.userId! } });
  res.render('dashboard/invest', { pageTitle: 'Invest', plan, wallet, usdRate: USD_NGN_RATE });
}

export async function investPost(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const { amount, tenureId } = req.body;
  const parsed = parseFloat(amount);

  if (!parsed || parsed <= 0) {
    req.flash('error', 'Please enter a valid amount.');
    res.redirect(`/dashboard/investments/${req.params.planId}/invest`);
    return;
  }

  try {
    const investmentId = await investmentService.createInvestment(userId, req.params.planId, parsed, tenureId);

    const [user, investment] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.userInvestment.findUnique({ where: { id: investmentId }, include: { plan: true } }),
    ]);

    if (user && investment) {
      try {
        await emailService.sendInvestmentConfirmation(
          user.email, user.firstName,
          investment.plan.name,
          Number(investment.amount),
          investment.maturityDate
        );
      } catch { /* silent */ }
    }

    req.flash('success', 'Investment activated successfully!');
    res.redirect('/dashboard/investments');
  } catch (err: unknown) {
    req.flash('error', err instanceof Error ? err.message : 'Investment failed. Please try again.');
    res.redirect(`/dashboard/investments/${req.params.planId}/invest`);
  }
}

// Early withdrawal — only allowed for plan types that permit anytime withdrawal
// (principal only, no returns): SAVINGS and QUICKIE.
const EARLY_WITHDRAWAL_TYPES = ['SAVINGS', 'QUICKIE'];

export async function redeemEarly(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const investment = await prisma.userInvestment.findUnique({
    where: { id: req.params.id },
    include: { plan: true },
  });

  if (!investment || investment.userId !== userId) {
    req.flash('error', 'Investment not found.');
    res.redirect('/dashboard/investments');
    return;
  }

  if (!EARLY_WITHDRAWAL_TYPES.includes(investment.plan.type)) {
    req.flash('error', 'Early withdrawal is only available for Savings Plan and Quickie investments. Other plans must be held to maturity.');
    res.redirect('/dashboard/investments');
    return;
  }

  if (investment.status !== 'ACTIVE') {
    req.flash('error', 'This investment is not active.');
    res.redirect('/dashboard/investments');
    return;
  }

  // Credit wallet with principal only (early withdrawal = no returns)
  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: investment.amount } },
    }),
    prisma.userInvestment.update({
      where: { id: investment.id },
      data: { status: 'WITHDRAWN' },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: 'RETURN',
        amount: investment.amount,
        status: 'CONFIRMED',
        reference: `EARLY-${investment.id.slice(0, 8)}-${Date.now()}`,
        description: `Early withdrawal of Savings Plan — ${investment.plan.name} (principal only, no returns)`,
        investmentId: investment.id,
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        title: 'Early Withdrawal Processed',
        message: `Your early withdrawal of ₦${Number(investment.amount).toLocaleString()} from ${investment.plan.name} has been credited to your wallet. Note: returns are only paid at maturity.`,
      },
    }),
  ]);

  req.flash('success', `₦${Number(investment.amount).toLocaleString()} returned to your wallet. Early withdrawals return principal only.`);
  res.redirect('/dashboard/investments');
}

// Investors cannot change their own tenure directly — this submits a request
// that an admin must approve (see admin/tenure-requests.controller.ts) before
// investmentService.changeTenure actually runs. Admins changing a tenure
// directly from the admin panel skip this queue entirely — that action is
// already admin-approved by construction.
export async function changeTenurePost(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const { tenureId } = req.body;

  const investment = await prisma.userInvestment.findUnique({
    where: { id: req.params.id },
    include: { plan: { include: { tenures: true } } },
  });
  if (!investment || investment.userId !== userId) {
    req.flash('error', 'Investment not found.');
    res.redirect('/dashboard/investments');
    return;
  }
  if (investment.status !== 'ACTIVE') {
    req.flash('error', 'Only active investments can have their tenure changed.');
    res.redirect('/dashboard/investments');
    return;
  }
  if (!investment.plan.tenures.some((t) => t.id === tenureId)) {
    req.flash('error', 'Please select a valid tenure.');
    res.redirect('/dashboard/investments');
    return;
  }

  const existingPending = await prisma.tenureChangeRequest.findFirst({
    where: { investmentId: investment.id, status: 'PENDING' },
  });
  if (existingPending) {
    req.flash('error', 'You already have a pending tenure change request for this investment.');
    res.redirect('/dashboard/investments');
    return;
  }

  await prisma.tenureChangeRequest.create({
    data: { investmentId: investment.id, requestedTenureId: tenureId },
  });

  req.flash('success', 'Your tenure change request has been submitted and is awaiting admin approval.');
  res.redirect('/dashboard/investments');
}
