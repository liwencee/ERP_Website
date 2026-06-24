import { Request, Response, NextFunction } from 'express';

// Site-wide maintenance gate, toggled WITHOUT a code change via the
// MAINTENANCE_MODE env var on Railway:
//   ON  -> `railway variables --service ERP_Website --set MAINTENANCE_MODE=on`
//   OFF -> `railway variables --service ERP_Website --set MAINTENANCE_MODE=off`
// When on, every page returns a 503 "be right back" page. Payment webhooks are
// exempt so any in-flight deposit still confirms. Static assets (logo/CSS) are
// already served earlier in the stack, so the page still renders branded.
const ENABLED = new Set(['1', 'true', 'on', 'yes', 'enabled']);

export function maintenanceMode(req: Request, res: Response, next: NextFunction): void {
  const flag = String(process.env.MAINTENANCE_MODE || '').trim().toLowerCase();
  if (!ENABLED.has(flag)) {
    next();
    return;
  }
  // Keep payment gateway callbacks/webhooks alive during maintenance.
  if (req.path.startsWith('/webhooks/')) {
    next();
    return;
  }
  res.status(503);
  res.set('Retry-After', '3600');
  res.render('maintenance', { title: 'Be Right Back' });
}
