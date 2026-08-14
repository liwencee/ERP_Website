import { Request, Response } from 'express';
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
  const existing = await prisma.transaction.findUnique({ where: { reference } });
  if (!existing) return 'notfound';

  const credited = await prisma.$transaction(async (tx) => {
    // Atomic, race-safe: the status flip only applies while still PENDING, so
    // concurrent confirmations (the server webhook and the browser callback
    // racing, or a duplicate webhook retry) can never both credit the wallet.
    const updated = await tx.transaction.updateMany({
      where: { reference, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (updated.count === 0) return false;

    await tx.wallet.update({ where: { userId: existing.userId }, data: { balance: { increment: amountNgn } } });
    await tx.notification.create({
      data: {
        userId: existing.userId,
        title: 'Deposit Confirmed',
        message: `₦${amountNgn.toLocaleString()} has been credited to your wallet via ${gateway}.`,
      },
    });
    return true;
  });

  if (!credited) return 'already';

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
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
