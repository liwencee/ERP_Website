import prisma from '../config/database';
import { addDays } from '../utils/helpers';
import { debitWallet, creditWallet } from './wallet.service';

export function calculateExpectedReturn(amount: number, rate: number): number {
  return parseFloat((amount * (1 + rate / 100)).toFixed(2));
}

export async function createInvestment(
  userId: string,
  planId: string,
  amount: number
): Promise<string> {
  const plan = await prisma.investmentPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== 'ACTIVE') throw new Error('Investment plan is not available.');

  if (amount < Number(plan.minAmount)) {
    throw new Error(`Minimum investment amount is ₦${Number(plan.minAmount).toLocaleString()}.`);
  }
  if (plan.maxAmount && amount > Number(plan.maxAmount)) {
    throw new Error(`Maximum investment amount is ₦${Number(plan.maxAmount).toLocaleString()}.`);
  }

  const expectedReturn = calculateExpectedReturn(amount, Number(plan.returnRate));
  const startDate = new Date();
  const maturityDate = addDays(startDate, plan.duration);

  // Debit wallet first (throws if insufficient)
  const ref = await debitWallet(userId, amount, 'INVESTMENT', `Investment in ${plan.name}`);

  // Create the investment record
  const investment = await prisma.userInvestment.create({
    data: {
      userId,
      planId,
      amount,
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
  await prisma.notification.create({
    data: {
      userId,
      title: 'Investment Activated',
      message: `Your investment of ₦${amount.toLocaleString()} in ${plan.name} is now active. Maturity: ${maturityDate.toLocaleDateString('en-NG')}.`,
    },
  });

  return investment.id;
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
