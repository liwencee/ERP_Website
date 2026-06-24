import axios from 'axios';
import crypto from 'crypto';

const SQUADCO_SECRET = process.env.SQUADCO_SECRET_KEY || '';
const SQUADCO_BASE = process.env.SQUADCO_ENV === 'production'
  ? 'https://api-d.squadco.com'
  : 'https://sandbox-api-d.squadco.com';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Squadco (Squad by GTBank) ──────────────────────────────────────────────────

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
    success: String(data.transaction_status).toLowerCase() === 'success',
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
