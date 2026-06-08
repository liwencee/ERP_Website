import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/database';
import * as paymentService from '../services/payment.service';
import * as emailService from '../services/email.service';

export async function paystack(req: Request, res: Response): Promise<void> {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '')
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { event, data } = req.body;

  if (event === 'charge.success') {
    const { reference, amount } = data;
    const tx = await prisma.transaction.findUnique({ where: { reference } });

    if (tx && tx.status === 'PENDING') {
      const amountNgn = amount / 100;
      await prisma.transaction.update({
        where: { reference },
        data: { status: 'CONFIRMED' },
      });
      await prisma.wallet.update({
        where: { userId: tx.userId },
        data: { balance: { increment: amountNgn } },
      });

      const user = await prisma.user.findUnique({ where: { id: tx.userId } });
      if (user) {
        await prisma.notification.create({
          data: {
            userId: tx.userId,
            title: 'Deposit Confirmed',
            message: `₦${amountNgn.toLocaleString()} has been credited to your wallet via Paystack.`,
          },
        });
        try {
          await emailService.sendDepositConfirmed(user.email, user.firstName, amountNgn, reference);
        } catch { /* silent */ }
      }
    }
  }

  res.sendStatus(200);
}

export async function squadco(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-squad-encrypted-body'] as string || '';
  if (!paymentService.verifySquadcoWebhook(JSON.stringify(req.body), signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { Event, Body } = req.body;
  if (Event === 'charge_successful') {
    const { transaction_ref: reference, amount } = Body;
    const tx = await prisma.transaction.findUnique({ where: { reference } });
    if (tx && tx.status === 'PENDING') {
      const amountNgn = amount / 100;
      await prisma.transaction.update({ where: { reference }, data: { status: 'CONFIRMED' } });
      await prisma.wallet.update({
        where: { userId: tx.userId },
        data: { balance: { increment: amountNgn } },
      });
      const user = await prisma.user.findUnique({ where: { id: tx.userId } });
      if (user) {
        await prisma.notification.create({
          data: {
            userId: tx.userId,
            title: 'Deposit Confirmed',
            message: `₦${amountNgn.toLocaleString()} has been credited to your wallet via Squad.`,
          },
        });
        try { await emailService.sendDepositConfirmed(user.email, user.firstName, amountNgn, reference); } catch { /* silent */ }
      }
    }
  }
  res.sendStatus(200);
}

export async function flutterwave(req: Request, res: Response): Promise<void> {
  const secretHash = process.env.FLW_SECRET_HASH || '';
  const signature = req.headers['verif-hash'];

  if (signature !== secretHash) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { event, data } = req.body;

  if (event === 'charge.completed' && data.status === 'successful') {
    const { tx_ref: reference, amount } = data;
    const tx = await prisma.transaction.findUnique({ where: { reference } });

    if (tx && tx.status === 'PENDING') {
      await prisma.transaction.update({
        where: { reference },
        data: { status: 'CONFIRMED' },
      });
      await prisma.wallet.update({
        where: { userId: tx.userId },
        data: { balance: { increment: amount } },
      });

      const user = await prisma.user.findUnique({ where: { id: tx.userId } });
      if (user) {
        await prisma.notification.create({
          data: {
            userId: tx.userId,
            title: 'Deposit Confirmed',
            message: `₦${Number(amount).toLocaleString()} has been credited to your wallet via Flutterwave.`,
          },
        });
        try {
          await emailService.sendDepositConfirmed(user.email, user.firstName, amount, reference);
        } catch { /* silent */ }
      }
    }
  }

  res.sendStatus(200);
}
