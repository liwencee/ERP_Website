import prisma from '../config/database';
import { addDays, generateRef, USD_NGN_RATE, usdToNgn } from '../utils/helpers';
import { debitWallet, creditWallet } from './wallet.service';

export function calculateExpectedReturn(amount: number, rate: number): number {
  return parseFloat((amount * (1 + rate / 100)).toFixed(2));
}

export async function createInvestment(
  userId: string,
  planId: string,
  amount: number,
  tenureId?: string
): Promise<string> {
  const plan = await prisma.investmentPlan.findUnique({
    where: { id: planId },
    include: { tenures: true },
  });
  if (!plan || plan.status !== 'ACTIVE') throw new Error('Investment plan is not available.');

  // For the Dollar plan the entered `amount` is in US dollars; everything else
  // is in Naira. Min/max are validated in the plan's own unit.
  const isDollar = plan.type === 'DOLLAR';
  const unit = isDollar ? '$' : '₦';

  // Tiers are non-overlapping price bands with inclusive bounds [min, max].
  // The bands do NOT share endpoints — each higher tier starts ₦1 above the
  // previous tier's max (Silver max ₦5,000,000, Bronze min ₦5,000,001, etc.),
  // so every amount falls in exactly one tier and can never overlap two.
  if (amount < Number(plan.minAmount)) {
    throw new Error(`The minimum investment for ${plan.name} is ${unit}${Number(plan.minAmount).toLocaleString()}.`);
  }
  if (plan.maxAmount && amount > Number(plan.maxAmount)) {
    throw new Error(`The maximum investment for ${plan.name} is ${unit}${Number(plan.maxAmount).toLocaleString()}.`);
  }

  // Resolve the chosen tenure. If the plan has tenures, one must be selected
  // (and must belong to this plan). Otherwise fall back to the plan headline.
  let rate = Number(plan.returnRate);
  let durationDays = plan.duration;
  let resolvedTenureId: string | null = null;
  let referralRate = 0;

  if (plan.tenures.length > 0) {
    const tenure = tenureId
      ? plan.tenures.find((t) => t.id === tenureId)
      : undefined;
    if (!tenure) {
      throw new Error('Please select a valid investment tenure.');
    }
    rate = Number(tenure.returnRate);
    durationDays = tenure.durationDays;
    resolvedTenureId = tenure.id;
    referralRate = Number(tenure.referralRate);
  }

  // Amounts are stored and settled in Naira (the wallet currency). For the Dollar
  // plan, convert the US-dollar figure to Naira at the current rate so the wallet
  // debit, stored principal and dashboard totals all share one currency. Returns
  // therefore settle in Naira at maturity.
  const principalNgn = isDollar ? usdToNgn(amount) : amount;
  const expectedReturn = calculateExpectedReturn(principalNgn, rate);
  const startDate = new Date();
  const maturityDate = addDays(startDate, durationDays);

  const debitDesc = isDollar
    ? `Investment in ${plan.name} ($${amount.toLocaleString()} at ₦${USD_NGN_RATE.toLocaleString()}/$)`
    : `Investment in ${plan.name}`;

  // Debit wallet first (throws if insufficient)
  const ref = await debitWallet(userId, principalNgn, 'INVESTMENT', debitDesc);

  // Create the investment record
  const investment = await prisma.userInvestment.create({
    data: {
      userId,
      planId,
      tenureId: resolvedTenureId,
      amount: principalNgn,
      expectedReturn,
      status: 'ACTIVE',
      startDate,
      maturityDate,
    },
  });

  // Update the transaction to link the investment
  await prisma.transaction.update({
    where: { reference: ref },
    data: { investmentId: investment.id },
  });

  // Notify investor
  const investedLabel = isDollar
    ? `$${amount.toLocaleString()} (₦${principalNgn.toLocaleString()})`
    : `₦${principalNgn.toLocaleString()}`;
  await prisma.notification.create({
    data: {
      userId,
      title: 'Investment Activated',
      message: `Your investment of ${investedLabel} in ${plan.name} is now active. Maturity: ${maturityDate.toLocaleDateString('en-NG')}.`,
    },
  });

  // Pay referral commission to whoever referred this investor (if any).
  // Non-critical: a failure here must never roll back the investment itself.
  try {
    await payReferralCommission(userId, principalNgn, referralRate, plan.name, investment.id);
  } catch {
    // swallow — referral payout is secondary to the investment succeeding
  }

  return investment.id;
}

// Credits the referrer's wallet with `amount × referralRate%` as a BONUS when a
// referred investor puts money to work. Marketing-funded — no one is debited.
// Idempotent by construction: called exactly once per investment creation.
export async function payReferralCommission(
  investorId: string,
  amount: number,
  referralRate: number,
  planName: string,
  investmentId: string
): Promise<void> {
  if (!referralRate || referralRate <= 0) return;

  const investor = await prisma.user.findUnique({
    where: { id: investorId },
    select: { referredBy: true, firstName: true, lastName: true },
  });
  if (!investor?.referredBy) return;

  const referrer = await prisma.user.findUnique({
    where: { id: investor.referredBy },
    select: { id: true, status: true, wallet: { select: { id: true } } },
  });
  if (!referrer || referrer.status === 'SUSPENDED' || !referrer.wallet) return;

  const commission = parseFloat((amount * (referralRate / 100)).toFixed(2));
  if (commission <= 0) return;

  const reference = generateRef('REF');
  const investorName = `${investor.firstName} ${investor.lastName}`;

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: referrer.id },
      data: { balance: { increment: commission } },
    }),
    prisma.transaction.create({
      data: {
        userId: referrer.id,
        type: 'BONUS',
        amount: commission,
        status: 'CONFIRMED',
        reference,
        description: `Referral commission (${referralRate}%) from ${investorName}'s investment in ${planName}`,
        investmentId,
      },
    }),
    prisma.notification.create({
      data: {
        userId: referrer.id,
        title: 'Referral Commission Earned',
        message: `You earned ₦${commission.toLocaleString()} (${referralRate}% referral bonus) because ${investorName} invested in ${planName}. It has been credited to your wallet.`,
      },
    }),
  ]);
}

export async function matureInvestment(investmentId: string): Promise<void> {
  const inv = await prisma.userInvestment.findUnique({
    where: { id: investmentId },
    include: { plan: true },
  });
  if (!inv || inv.status !== 'ACTIVE') throw new Error('Investment not found or not active.');

  await prisma.userInvestment.update({
    where: { id: investmentId },
    data: { status: 'MATURED' },
  });

  await creditWallet(inv.userId, Number(inv.expectedReturn), 'WALLET', `Returns from ${inv.plan.name}`);

  await prisma.notification.create({
    data: {
      userId: inv.userId,
      title: 'Investment Matured',
      message: `Your investment in ${inv.plan.name} has matured. ₦${Number(inv.expectedReturn).toLocaleString()} has been credited to your wallet.`,
    },
  });
}
