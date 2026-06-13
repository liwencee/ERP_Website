import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/database';
import * as paymentService from '../services/payment.service';
import * as emailService from '../services/email.service';

// The raw request body captured by express.json's `verify` hook. HMAC signatures
// must be computed over the exact bytes the gateway signed — re-stringifying the
// parsed body can reorder keys/whitespace and break verification.
function rawBodyOf(req: Request): string {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  return raw ? raw.toString('utf8') : JSON.stringify(req.body);
}

// Idempotently confirm a pending deposit: mark CONFIRMED, credit the wallet,
// notify and email. Safe to call from BOTH the server webhook and the browser
// callback — only the first call (while still PENDING) moves money.
async function confirmDeposit(
  reference: string,
  amountNgn: number,
  gateway: string
): Promise<'credited' | 'already' | 'notfound'> {
  const tx = await prisma.transaction.findUnique({ where: { reference } });
  if (!tx) return 'notfound';
  if (tx.status !== 'PENDING') return 'already';

  await prisma.$transaction([
    prisma.transaction.update({ where: { reference }, data: { status: 'CONFIRMED' } }),
    prisma.wallet.update({ where: { userId: tx.userId }, data: { balance: { increment: amountNgn } } }),
    prisma.notification.create({
      data: {
        userId: tx.userId,
        title: 'Deposit Confirmed',
        message: `₦${amountNgn.toLocaleString()} has been credited to your wallet via ${gateway}.`,
      },
    }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: tx.userId } });
  if (user) {
    try {
      await emailService.sendDepositConfirmed(user.email, user.firstName, amountNgn, reference);
    } catch {
      /* silent — don't fail the webhook on email errors */
    }
  }
  return 'credited';
}

// ─── Squad by GTBank ────────────────────────────────────────────────────────────

// Server-to-server webhook (set this URL in your Squad dashboard).
export async function squadco(req: Request, res: Response): Promise<void> {
  const signature = (req.headers['x-squad-encrypted-body'] as string) || '';
  if (!signature || !paymentService.verifySquadcoWebhook(rawBodyOf(req), signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { Event, Body } = req.body;
  if (Event === 'charge_successful' && Body?.transaction_ref) {
    await confirmDeposit(Body.transaction_ref, Number(Body.amount) / 100, 'Squad');
  }
  res.sendStatus(200);
}

// Browser redirect after the customer finishes paying (callback_url). Verifies
// the transaction directly with Squad, credits if the webhook hasn't already,
// then returns the user to their wallet with a clear message.
export async function squadcoCallback(req: Request, res: Response): Promise<void> {
  const reference = (req.query.transaction_ref || req.query.reference || req.query.ref) as string;
  if (!reference) {
    req.flash('info', 'Returning from payment. If you were debited, your wallet will update shortly.');
    res.redirect('/dashboard/wallet');
    return;
  }
  try {
    const result = await paymentService.verifySquadco(reference);
    if (result.success) {
      const outcome = await confirmDeposit(reference, result.amount, 'Squad');
      if (outcome === 'notfound') {
        req.flash('info', 'Payment received. Your wallet will be credited shortly.');
      } else {
        req.flash('success', `Payment successful — ₦${result.amount.toLocaleString()} added to your wallet.`);
      }
    } else {
      req.flash('error', 'Your payment was not completed. If you were debited, please contact support.');
    }
  } catch {
    req.flash('info', 'We could not confirm your payment instantly. If you were debited, your wallet will update once confirmed.');
  }
  res.redirect('/dashboard/wallet');
}

// ─── Paystack ─────────────────────────────────────────────────────────────────

export async function paystack(req: Request, res: Response): Promise<void> {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '')
    .update(rawBodyOf(req))
    .digest('hex');
  if (hash !== req.headers['x-paystack-signature']) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { event, data } = req.body;
  if (event === 'charge.success' && data?.reference) {
    await confirmDeposit(data.reference, Number(data.amount) / 100, 'Paystack');
  }
  res.sendStatus(200);
}

export async function paystackCallback(req: Request, res: Response): Promise<void> {
  const reference = (req.query.reference || req.query.trxref) as string;
  if (!reference) {
    req.flash('info', 'Returning from payment.');
    res.redirect('/dashboard/wallet');
    return;
  }
  try {
    const result = await paymentService.verifyPaystack(reference);
    if (result.success) {
      await confirmDeposit(reference, result.amount, 'Paystack');
      req.flash('success', `Payment successful — ₦${result.amount.toLocaleString()} added to your wallet.`);
    } else {
      req.flash('error', 'Your payment was not completed. If you were debited, please contact support.');
    }
  } catch {
    req.flash('info', 'We could not confirm your payment instantly. Your wallet will update once confirmed.');
  }
  res.redirect('/dashboard/wallet');
}

// ─── Flutterwave ──────────────────────────────────────────────────────────────

export async function flutterwave(req: Request, res: Response): Promise<void> {
  const secretHash = process.env.FLW_SECRET_HASH || '';
  if (req.headers['verif-hash'] !== secretHash) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { event, data } = req.body;
  if (event === 'charge.completed' && data?.status === 'successful' && data?.tx_ref) {
    // Flutterwave amounts are already in the major unit (Naira), not kobo.
    await confirmDeposit(data.tx_ref, Number(data.amount), 'Flutterwave');
  }
  res.sendStatus(200);
}

export async function flutterwaveCallback(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string;
  const transactionId = (req.query.transaction_id || req.query.transactionId) as string;
  const txRef = req.query.tx_ref as string;

  if (status === 'cancelled') {
    req.flash('error', 'Payment was cancelled.');
    res.redirect('/dashboard/wallet');
    return;
  }
  if (!transactionId && !txRef) {
    req.flash('info', 'Returning from payment.');
    res.redirect('/dashboard/wallet');
    return;
  }
  try {
    const result = await paymentService.verifyFlutterwave(transactionId);
    if (result.success) {
      await confirmDeposit(result.reference, result.amount, 'Flutterwave');
      req.flash('success', `Payment successful — ₦${result.amount.toLocaleString()} added to your wallet.`);
    } else {
      req.flash('error', 'Your payment was not completed. If you were debited, please contact support.');
    }
  } catch {
    req.flash('info', 'We could not confirm your payment instantly. Your wallet will update once confirmed.');
  }
  res.redirect('/dashboard/wallet');
}
