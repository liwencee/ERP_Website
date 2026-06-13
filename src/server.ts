import 'express-async-errors';
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'connect-flash';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import sessionConfig from './config/session';
import logger from './utils/logger';
import router from './routes';
import localsMiddleware from './middleware/locals.middleware';
import { sameOriginOnly } from './middleware/security.middleware';
import { serveUpload } from './controllers/files.controller';
import { runMaturityJob } from './jobs/mature-investments';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the Vercel/proxy TLS terminator so secure cookies are set correctly
// (express-session refuses to set a `secure` cookie if it thinks the
// connection is plain HTTP, which it is behind the proxy without this).
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://*.tawk.to',
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'https://*.tawk.to',
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://js.paystack.co',
        'https://embed.tawk.to',
        'https://*.tawk.to',
      ],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://*.tawk.to',
        'wss://*.tawk.to',
      ],
      frameSrc: [
        "'self'",
        'https://*.tawk.to',
        'https://maps.google.com',
        'https://www.google.com',
      ],
    },
  },
}));
app.use(hpp());
app.use(cors({ origin: process.env.APP_URL, credentials: true }));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later.',
});
app.use(limiter);

// ─── Body parsing ────────────────────────────────────────────────────────────
// Capture the raw JSON body so webhook HMAC signatures can be verified against
// the exact bytes the payment gateway signed (re-stringifying can break them).
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Session & flash ─────────────────────────────────────────────────────────
app.use(session(sessionConfig));
app.use(flash());

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ─── Path resolution ─────────────────────────────────────────────────────────
// On Vercel the bundled function changes __dirname, so resolve views/public
// relative to the project root (process.cwd()) which always points to /var/task.
const ROOT = process.env.VERCEL ? process.cwd() : path.join(__dirname, '..');

// ─── Uploaded files (authenticated) ──────────────────────────────────────────
// Gate /uploads (KYC documents, payment proofs, avatars) behind login + ownership
// BEFORE the public static handler can serve them to anyone with the URL.
app.use('/uploads', serveUpload);

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(ROOT, 'public')));

// ─── View engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));

// ─── Locals ──────────────────────────────────────────────────────────────────
app.use(localsMiddleware);

// ─── CSRF (same-origin guard for state-changing requests) ─────────────────────
app.use(sameOriginOnly);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use(router);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).render('errors/404', { title: 'Page Not Found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.stack || err.message);
  res.status(500).render('errors/500', { title: 'Server Error' });
});

// ─── Investment maturity job ─────────────────────────────────────────────────
// Runs once on startup, then every hour to credit matured investments
function startMaturityScheduler(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  // Initial run shortly after startup
  setTimeout(() => {
    runMaturityJob().catch((err) =>
      logger.error(`[MaturityJob] Startup run failed: ${err.message}`)
    );
  }, 10_000); // 10 seconds after boot

  // Recurring hourly
  setInterval(() => {
    runMaturityJob().catch((err) =>
      logger.error(`[MaturityJob] Scheduled run failed: ${err.message}`)
    );
  }, INTERVAL_MS);

  logger.info('[MaturityJob] Scheduler started — runs every hour');
}

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`EPR Access server running on http://localhost:${PORT}`);
    startMaturityScheduler();
  });
}

export default app;
