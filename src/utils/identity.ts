// Helpers for recognising "the same person" behind different-looking signups.
// Used by registration (to refuse duplicate accounts) and by the referral payout
// (to refuse commission on self-referrals).

// Throwaway-inbox providers. Not exhaustive — it stops the common ones people
// reach for when they need a fresh address in seconds.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'guerrillamail.de', 'sharklasers.com', 'grr.la', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'tempmail.com',
  'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'tempail.com',
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trashmail.io',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'getnada.com', 'nada.email',
  'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'dispostable.com',
  'fakeinbox.com', 'fakemail.net', 'emailondeck.com', 'mohmal.com',
  'burnermail.io', 'mailcatch.com', 'mytemp.email', 'moakt.com', 'tmail.ws',
  'discard.email', 'discardmail.com', 'spambox.us', 'spamgourmet.com',
  'inboxkitten.com', 'harakirimail.com', 'mail.tm', 'emailfake.com',
  'tempinbox.com', 'dropmail.me', 'minuteinbox.com', 'tmpmail.org', 'tmpmail.net',
  'cs.email', 'mailpoof.com', 'e4ward.com', 'owlymail.com', 'luxusmail.org',
]);

/** True for addresses on known throwaway-mail domains (and their subdomains). */
export function isDisposableEmail(email: string): boolean {
  const domain = String(email).trim().toLowerCase().split('@')[1];
  if (!domain) return false;
  const parts = domain.split('.');
  // Match the domain itself and any parent domain (x.mailinator.com).
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/**
 * Collapses the tricks that make one inbox look like many addresses:
 *   - case:               Jane@x.com        -> jane@x.com
 *   - "+tag" sub-address: jane+2@x.com      -> jane@x.com
 *   - Gmail dots:         j.a.n.e@gmail.com -> jane@gmail.com
 *   - googlemail.com is Gmail under another name.
 * The result is only used to COMPARE accounts — people still log in with, and
 * receive mail at, the exact address they typed.
 */
export function canonicalEmail(email: string): string {
  const cleaned = String(email).trim().toLowerCase();
  const at = cleaned.lastIndexOf('@');
  if (at < 1) return cleaned;
  let local = cleaned.slice(0, at);
  let domain = cleaned.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);

  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');

  return `${local}@${domain}`;
}

/**
 * Reduces a phone number to a comparable form: digits only, with a Nigerian
 * country code or leading trunk zero removed so 0803…, +234803… and 234803…
 * all match. Returns null if it can't be a real number.
 */
export function normalizePhone(phone: string): string | null {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);      // 00234… international prefix
  if (digits.startsWith('234') && digits.length >= 13) digits = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

interface Linkable {
  phoneNormalized?: string | null;
  signupIp?: string | null;
  bankAccountNumber?: string | null;
}

/**
 * Do these two accounts look like the same person? Used to deny referral
 * commission when someone refers themselves through a second account.
 * Returns the reason (for the log) or null when nothing links them.
 */
export function selfReferralSignal(a: Linkable, b: Linkable): string | null {
  if (a.phoneNormalized && a.phoneNormalized === b.phoneNormalized) return 'same phone number';
  if (a.bankAccountNumber && a.bankAccountNumber === b.bankAccountNumber) return 'same bank account';
  if (a.signupIp && a.signupIp === b.signupIp) return 'same signup IP';
  return null;
}
