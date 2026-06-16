import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Stricter limiter for authentication endpoints to blunt brute-force and
// credential-stuffing attacks. `skipSuccessfulRequests` means only FAILED
// attempts count, so legitimate users who log in cleanly are never penalised.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
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
  if (source) {
    // Treat the apex domain and the www subdomain as the same site, e.g.
    // epraaccess.com === www.epraaccess.com.
    const normalize = (h: string): string => h.replace(/^www\./i, '').toLowerCase();
    try {
      const sourceHost = normalize(new URL(source).hostname);

      // Build the set of hosts we accept as same-origin: the host this request
      // actually arrived on (req.hostname, resolved from X-Forwarded-Host behind
      // Railway's proxy) plus the configured canonical APP_URL host. This works
      // whether the visitor uses the apex domain or the www subdomain.
      const allowed = new Set<string>([normalize(req.hostname)]);
      if (process.env.APP_URL) {
        try { allowed.add(normalize(new URL(process.env.APP_URL).hostname)); } catch { /* ignore */ }
      }

      if (!allowed.has(sourceHost)) {
        res.status(403).render('errors/404', { title: 'Request Blocked' });
        return;
      }
    } catch {
      res.status(403).render('errors/404', { title: 'Request Blocked' });
      return;
    }
  }
  // No Origin/Referer header: SameSite=Lax already prevents the session cookie
  // from being sent on a genuine cross-site POST, so allow it through.
  next();
}
