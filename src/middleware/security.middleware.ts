import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { PgRateLimitStore } from '../services/throttle';

// All sensitive limiters keep their counters in Postgres (PgRateLimitStore) so
// limits survive restarts and are shared across instances/serverless calls. The
// blanket limiter in server.ts stays in memory — it's a coarse safety net and
// runs on every request, so it shouldn't cost a query each time.
const skipInTest = (): boolean => process.env.NODE_ENV === 'test';

function dbLimiter(prefix: string, windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PgRateLimitStore(prefix),
    skip: skipInTest,
  });
}

// ─── Authentication endpoints (separate buckets) ─────────────────────────────
// They used to share ONE budget of 10, so on a shared mobile-network IP a few
// people signing up could lock everyone else out of logging in. Every request
// counts regardless of outcome — failed logins redirect with 302 (not 4xx), so
// skipSuccessfulRequests would skip them entirely and make this useless.
// Per-ACCOUNT lockout (many IPs, one victim) is separate: see loginLockout in
// auth.controller.ts.
export const loginLimiter = dbLimiter('login', 15 * 60 * 1000, 10,
  'Too many login attempts. Please wait 15 minutes and try again.');
export const signupLimiter = dbLimiter('signup', 15 * 60 * 1000, 10,
  'Too many sign-up attempts. Please wait 15 minutes and try again.');
// Forgot-password, reset-password and resend-verification all send email or
// consume tokens, so they get the tightest budget.
export const recoveryLimiter = dbLimiter('recovery', 15 * 60 * 1000, 6,
  'Too many requests. Please wait 15 minutes and try again.');

// Throttles the public contact form so it can't be used to spam the business
// inbox or run up the Resend API quota.
export const contactLimiter = dbLimiter('contact', 60 * 60 * 1000, 5,
  'Too many messages sent. Please try again in an hour.');

// Public chatbot: unauthenticated and every message runs a database query.
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore('chat'),
  skip: skipInTest,
  handler: (_req, res) => {
    res.status(429).json({ reply: "You're sending messages very quickly — please wait a moment and try again." });
  },
});

// ─── Signed-in user actions ──────────────────────────────────────────────────
// Keyed by user id (not IP) so shared networks don't penalise each other and one
// user can't dodge the limit by changing network. Falls back to IP if somehow
// unauthenticated. On breach the user is sent back to `redirectTo` with a flash
// message, since these are normal HTML form posts.
export function userLimiter(opts: {
  name: string;
  windowMs: number;
  max: number;
  message: string;
  redirectTo: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PgRateLimitStore(`user-${opts.name}`),
    keyGenerator: (req) => (req.session?.userId ? `u:${req.session.userId}` : `ip:${req.ip}`),
    skip: skipInTest,
    handler: (req, res) => {
      req.flash('error', opts.message);
      res.redirect(opts.redirectTo);
    },
  });
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const withdrawLimiter = userLimiter({
  name: 'withdraw', windowMs: HOUR, max: 5, redirectTo: '/dashboard/wallet',
  message: 'Too many withdrawal requests. Please wait an hour or contact support.',
});
export const fundLimiter = userLimiter({
  name: 'fund', windowMs: HOUR, max: 10, redirectTo: '/dashboard/wallet',
  message: 'Too many funding requests. Please wait a while before trying again.',
});
export const investLimiter = userLimiter({
  name: 'invest', windowMs: HOUR, max: 20, redirectTo: '/dashboard/investments',
  message: 'Too many investment actions. Please wait a while before trying again.',
});
export const passwordLimiter = userLimiter({
  name: 'password', windowMs: 15 * MIN, max: 5, redirectTo: '/dashboard/profile',
  message: 'Too many password change attempts. Please wait 15 minutes.',
});
export const profileLimiter = userLimiter({
  name: 'profile', windowMs: HOUR, max: 20, redirectTo: '/dashboard/profile',
  message: 'Too many profile updates. Please wait a while before trying again.',
});
export const uploadWalletLimiter = userLimiter({
  name: 'upload-wallet', windowMs: HOUR, max: 10, redirectTo: '/dashboard/wallet',
  message: 'Too many uploads. Please wait a while before trying again.',
});
export const uploadProfileLimiter = userLimiter({
  name: 'upload-profile', windowMs: HOUR, max: 10, redirectTo: '/dashboard/profile',
  message: 'Too many uploads. Please wait a while before trying again.',
});
export const uploadKycLimiter = userLimiter({
  name: 'upload-kyc', windowMs: HOUR, max: 10, redirectTo: '/dashboard/kyc',
  message: 'Too many uploads. Please wait a while before trying again.',
});

// CSRF hardening for a same-site app. Rejects state-changing requests whose
// Origin/Referer is a DIFFERENT host than the one serving the app. Combined with
// the SameSite=Lax session cookie (which already stops the cookie riding along
// on a cross-site POST) this blocks cross-site request forgery without needing a
// hidden token in every form. Webhooks are exempt: they carry no browser origin
// and are authenticated by HMAC signatures instead.
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  if (req.path.startsWith('/webhooks/')) {
    next();
    return;
  }

  const source = req.get('origin') || req.get('referer');

  // No Origin/Referer, or an OPAQUE origin: browsers legitimately send the
  // literal string "null" under a strict Referrer-Policy (this app sets
  // `Referrer-Policy: no-referrer`), after certain redirects, and from some
  // mobile/privacy contexts. There's no host to compare in those cases, so we
  // must NOT block — the SameSite=Lax session cookie already prevents the
  // cookie from riding along on a genuine cross-site POST, which is what
  // actually stops CSRF. (Previously `new URL("null")` threw here and rendered
  // the "Request Blocked" 404, which blocked real mobile/redirected logins.)
  if (!source || source === 'null') {
    next();
    return;
  }

  // Treat the apex domain and the www subdomain as the same site, e.g.
  // epraaccess.com === www.epraaccess.com.
  const normalize = (h: string): string => h.replace(/^www\./i, '').toLowerCase();

  let sourceHost: string;
  try {
    sourceHost = normalize(new URL(source).hostname);
  } catch {
    // Unparseable Origin/Referer — we can't determine the host, so fail OPEN
    // (SameSite=Lax still protects) rather than blocking a legitimate user.
    next();
    return;
  }

  // Build the set of hosts we accept as same-origin: the host this request
  // actually arrived on (req.hostname, resolved from X-Forwarded-Host behind
  // Railway's proxy) plus the configured canonical APP_URL host. This works
  // whether the visitor uses the apex domain or the www subdomain.
  const allowed = new Set<string>([normalize(req.hostname)]);
  if (process.env.APP_URL) {
    try { allowed.add(normalize(new URL(process.env.APP_URL).hostname)); } catch { /* ignore */ }
  }

  // Only block when we have a VALID, clearly cross-site origin.
  if (!allowed.has(sourceHost)) {
    res.status(403).render('errors/404', { title: 'Request Blocked' });
    return;
  }

  next();
}
