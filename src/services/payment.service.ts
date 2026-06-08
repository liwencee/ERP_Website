import axios from 'axios';
import crypto from 'crypto';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const FLUTTERWAVE_SECRET = process.env.FLUTTERWAVE_SECRET_KEY || '';
const SQUADCO_SECRET = process.env.SQUADCO_SECRET_KEY || '';
const SQUADCO_BASE = process.env.SQUADCO_ENV === 'production'
  ? 'https://api-d.squadco.com'
  : 'https://sandbox-api-d.squadco.com';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Squadco ──────────────────────────────────────────────────────────────────

export async function initializeSquadco(
  email: string,
  amount: number,
  reference: string
): Promise<string> {
  const response = await axios.post(
    `${SQUADCO_BASE}/transaction/initiate`,
    {
      email,
      amount: Math.round(amount * 100), // kobo
      currency: 'NGN',
      initiate_type: 'inline',
      transaction_ref: reference,
      callback_url: `${APP_URL}/webhooks/squadco/callback`,
    },
    { headers: { Authorization: `Bearer ${SQUADCO_SECRET}`, 'Content-Type': 'application/json' } }
  );
  return response.data.data.checkout_url;
}

export async function verifySquadco(transactionRef: string): Promise<{ success: boolean; amount: number }> {
  const response = await axios.get(
    `${SQUADCO_BASE}/transaction/verify/${transactionRef}`,
    { headers: { Authorization: `Bearer ${SQUADCO_SECRET}` } }
  );
  const data = response.data.data;
  return {
    success: data.transaction_status === 'Success',
    amount: data.transaction_amount / 100,
  };
}

export function verifySquadcoWebhook(rawBody: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha512', SQUADCO_SECRET)
    .update(rawBody)
    .digest('hex');
  return hash.toLowerCase() === signature.toLowerCase();
}

// ─── Paystack ─────────────────────────────────────────────────────────────────

export async function initializePaystack(
  email: string,
  amount: number,
  reference: string
): Promise<string> {
  const response = await axios.post(
    'https://api.paystack.co/transaction/initialize',
    {
      email,
      amount: Math.round(amount * 100),
      reference,
      callback_url: `${APP_URL}/webhooks/paystack/callback`,
    },
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
  );
  return response.data.data.authorization_url;
}

export async function verifyPaystack(reference: string): Promise<{ success: boolean; amount: number }> {
  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
  );
  const data = response.data.data;
  return {
    success: data.status === 'success',
    amount: data.amount / 100,
  };
}

// ─── Flutterwave ──────────────────────────────────────────────────────────────

export async function initializeFlutterwave(
  email: string,
  firstName: string,
  lastName: string,
  amount: number,
  reference: string
): Promise<string> {
  const response = await axios.post(
    'https://api.flutterwave.com/v3/payments',
    {
      tx_ref: reference,
      amount,
      currency: 'NGN',
      redirect_url: `${APP_URL}/webhooks/flutterwave/callback`,
      customer: { email, name: `${firstName} ${lastName}` },
      customizations: { title: 'EPR Access Limited', logo: `${APP_URL}/images/logo.png` },
    },
    { headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET}` } }
  );
  return response.data.data.link;
}

export async function verifyFlutterwave(transactionId: string): Promise<{ success: boolean; amount: number; reference: string }> {
  const response = await axios.get(
    `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
    { headers: { Authorization: `Bearer ${FLUTTERWAVE_SECRET}` } }
  );
  const data = response.data.data;
  return {
    success: data.status === 'successful',
    amount: data.amount,
    reference: data.tx_ref,
  };
}
