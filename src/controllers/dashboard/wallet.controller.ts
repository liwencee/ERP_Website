import { Request, Response } from 'express';
import prisma from '../../config/database';
import * as walletService from '../../services/wallet.service';
import * as paymentService from '../../services/payment.service';
import { generateRef } from '../../utils/helpers';
import logger from '../../utils/logger';

// Whether the Squad card gateway is configured (has a secret key). Used to only
// show the card option in the fund modal and to reject it server-side if the key
// is missing. (Paystack/Flutterwave were removed — Squad is the only gateway.)
function availableGateways(): Record<string, boolean> {
  return {
    SQUADCO: !!process.env.SQUADCO_SECRET_KEY,
  };
}

export async function index(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const [wallet, transactions] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId, type: { in: ['DEPOSIT', 'WITHDRAWAL'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);
  res.render('dashboard/wallet', { pageTitle: 'Wallet', wallet, transactions, gateways: availableGateways() });
}

export async function fundPost(req: Request, res: Response): Promise<void> {
  const { amount, method } = req.body;
  const parsed = parseFloat(amount);
  const userId = req.session.userId!;

  if (!parsed || parsed < 100) {
    req.flash('error', 'Minimum deposit is ₦100.');
    res.redirect('/dashboard/wallet');
    return;
  }

  // Reject card payment if Squad isn't configured (defensive — the UI already
  // hides it, but a stale page/direct POST could still send it).
  const gateways = availableGateways();
  if (method === 'SQUADCO' && !gateways.SQUADCO) {
    req.flash('error', 'Card payment is currently unavailable. Please use Bank Transfer.');
    res.redirect('/dashboard/wallet');
    return;
  }

  if (method === 'SQUADCO') {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const ref = generateRef('SQD');

      await prisma.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          amount: parsed,
          status: 'PENDING',
          reference: ref,
          paymentMethod: 'SQUADCO',
          description: 'Card payment via Squad',
        },
      });

      const checkoutUrl = await paymentService.initializeSquadco(user!.email, parsed, ref);
      res.redirect(checkoutUrl);
    } catch (err) {
      logger.error(`Squad payment init failed: ${(err as Error).message}`);
      req.flash('error', 'Card payment initialization failed. Please try again.');
      res.redirect('/dashboard/wallet');
    }
  } else {
    // Bank transfer
    const ref = generateRef('BNK');
    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount: parsed,
        status: 'PENDING',
        reference: ref,
        paymentMethod: 'BANK_TRANSFER',
        description: 'Bank transfer deposit',
      },
    });
    req.flash('info', `Please transfer ₦${parsed.toLocaleString()} to our bank account with reference: ${ref}. Your wallet will be credited after confirmation.`);
    res.redirect('/dashboard/wallet');
  }
}

export async function fundUpload(req: Request, res: Response): Promise<void> {
  const { reference } = req.body;
  if (!req.file || !reference) {
    req.flash('error', 'Please provide a payment reference and proof of payment.');
    res.redirect('/dashboard/wallet');
    return;
  }

  const proofUrl = `/uploads/${req.file.filename}`;
  await prisma.transaction.updateMany({
    where: { reference, userId: req.session.userId! },
    data: { proofUrl },
  });

  req.flash('success', 'Payment proof uploaded. We will confirm your deposit shortly.');
  res.redirect('/dashboard/wallet');
}

export async function withdrawPost(req: Request, res: Response): Promise<void> {
  const { amount, bankName, accountNumber, accountName } = req.body;
  const parsed = parseFloat(amount);
  const userId = req.session.userId!;

  if (!parsed || parsed < 1000) {
    req.flash('error', 'Minimum withdrawal is ₦1,000.');
    res.redirect('/dashboard/wallet');
    return;
  }

  const bank = String(bankName || '').trim();
  const acctNo = String(accountNumber || '').trim();
  const acctName = String(accountName || '').trim();

  if (!bank || !acctNo || !acctName) {
    req.flash('error', 'Please select your bank and enter your account name and number.');
    res.redirect('/dashboard/wallet');
    return;
  }
  if (!/^\d{10}$/.test(acctNo)) {
    req.flash('error', 'Account number must be exactly 10 digits.');
    res.redirect('/dashboard/wallet');
    return;
  }

  try {
    await walletService.requestWithdrawal(userId, parsed, {
      bankName: bank,
      accountNumber: acctNo,
      accountName: acctName,
    });
    req.flash('success', 'Withdrawal request submitted. It will be processed within 24 hours.');
  } catch (err: unknown) {
    req.flash('error', err instanceof Error ? err.message : 'Withdrawal failed.');
  }
  res.redirect('/dashboard/wallet');
}
