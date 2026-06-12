import { randomUUID } from 'crypto';

// Exchange rate used for the Dollar Investment plan: how many Naira per US$1.
// Override per-environment with the USD_NGN_RATE env var (e.g. on Vercel).
export const USD_NGN_RATE = Number(process.env.USD_NGN_RATE) || 1600;

// Convert a US dollar figure to its Naira equivalent at the current rate.
export function usdToNgn(usd: number): number {
  return parseFloat((usd * USD_NGN_RATE).toFixed(2));
}

export function generateRef(prefix = 'EPR'): string {
  return `${prefix}-${Date.now()}-${randomUUID().split('-')[0].toUpperCase()}`;
}

export function formatCurrency(amount: number | string | { toString(): string }, currency = 'NGN'): string {
  const num = typeof amount === 'object' ? parseFloat(amount.toString()) : Number(amount);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function generateToken(): string {
  return randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const masked = local.slice(0, 2) + '***' + local.slice(-1);
  return `${masked}@${domain}`;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EPR';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
