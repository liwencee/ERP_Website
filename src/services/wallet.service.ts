import prisma from '../config/database';
import { generateRef } from '../utils/helpers';

export async function getBalance(userId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return wallet ? Number(wallet.balance) : 0;
}

export async function creditWallet(
  userId: string,
  amount: number,
  method: string,
  description?: string,
  ref?: string
): Promise<void> {
  const reference = ref || generateRef('DEP');
  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount,
        status: 'CONFIRMED',
        reference,
        paymentMethod: method,
        description: description || 'Wallet deposit',
      },
    }),
  ]);
}

export async function debitWallet(
  userId: string,
  amount: number,
  type: string,
  description?: string,
  investmentId?: string
): Promise<string> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < amount) {
    throw new Error('Insufficient wallet balance.');
  }

  const reference = generateRef(type === 'WITHDRAWAL' ? 'WDR' : 'INV');

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type,
        amount,
        status: 'CONFIRMED',
        reference,
        description: description || type.toLowerCase(),
        investmentId: investmentId || null,
      },
    }),
  ]);

  return reference;
}

export interface WithdrawalBank {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export async function requestWithdrawal(
  userId: string,
  amount: number,
  bank: WithdrawalBank
): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || Number(wallet.balance) < amount) {
    throw new Error('Insufficient wallet balance.');
  }

  const reference = generateRef('WDR');

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    }),
    prisma.transaction.create({
      data: {
        userId,
        type: 'WITHDRAWAL',
        amount,
        status: 'PENDING',
        reference,
        description: `Withdrawal to ${bank.bankName} — ${bank.accountNumber} (${bank.accountName})`,
        bankName: bank.bankName,
        bankAccountNumber: bank.accountNumber,
        bankAccountName: bank.accountName,
      },
    }),
    // Remember these details as the user's default payout bank for next time
    prisma.user.update({
      where: { id: userId },
      data: {
        bankName: bank.bankName,
        bankAccountNumber: bank.accountNumber,
        bankAccountName: bank.accountName,
      },
    }),
  ]);
}
