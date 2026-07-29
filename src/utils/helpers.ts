import { randomUUID, randomInt } from 'crypto';

// Exchange rate used for the Dollar Investment plan: how many Naira per US$1.
// Override per-environment with the USD_NGN_RATE env var (e.g. on Vercel).
export const USD_NGN_RATE = Number(process.env.USD_NGN_RATE) || 1400;

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

// Date + time (used for "Last Seen" — the time matters for spotting logins at
// unusual hours, which formatDate alone would hide).
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

// Display-name overrides for investment plans. The DB `name` is the source of
// truth — it drives URL slugs and lookups — so to relabel a plan for users WITHOUT
// breaking its link, add a mapping here instead of renaming it in the database.
const PLAN_DISPLAY_NAMES: Record<string, string> = {
  'Save Future – My Savings Plan': 'My Savings Plan - Save Future SF',
};

// Returns the user-facing name for a plan (falls back to the real name).
export function planDisplayName(name: string): string {
  return PLAN_DISPLAY_NAMES[name] || name;
}

// Canonical plan display order — MUST mirror the Investments dropdown in
// views/partials/public-nav.ejs. Used to order plan cards on the dashboard and
// public pages so the whole app is consistent. Matched by name substring.
const PLAN_DISPLAY_ORDER = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Quickie', 'Save Future', 'Trading', 'Dollar', 'Fixed Deposit', 'Real Estate'];

export function sortPlansByMenu<T extends { name: string }>(plans: T[]): T[] {
  const rank = (name: string): number => {
    const i = PLAN_DISPLAY_ORDER.findIndex((k) => name.includes(k));
    return i === -1 ? 999 : i;
  };
  return [...plans].sort((a, b) => rank(a.name) - rank(b.name));
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
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}
