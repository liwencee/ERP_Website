import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Stricter limiter for authentication endpoints to blunt brute-force and
// credential-stuffing attacks. All requests count regardless of outcome —
// failed logins redirect with 302 (not 4xx), so skipSuccessfulRequests:true
// would skip them entirely, making the limiter useless against brute-force.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// Throttles the public contact form so it can't be used to spam the business
// inbox or run up the Resend API quota.
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many messages sent. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
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
