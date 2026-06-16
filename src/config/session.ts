import session from 'express-session';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

function buildStore(): session.Store | undefined {
  const dbUrl = process.env.DATABASE_URL || '';

  // Postgres-backed sessions whenever a Postgres DB is configured.
  // Critical on Railway: serverless/multi-instance environments don't share
  // memory, so an in-memory store loses sessions between requests. A shared DB
  // store keeps users logged in across every invocation.
  if (dbUrl.startsWith('postgres')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pgSession = require('connect-pg-simple')(session);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');

      logger.info('[Session] DATABASE_URL detected — initialising Postgres session store');

      const pool = new Pool({
        connectionString: dbUrl,
        // Railway Postgres HA (HAProxy + Patroni) terminates TLS; accept the
        // self-signed cert it presents rather than rejecting the connection.
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 3,
        // Surface connection errors quickly so they appear in logs rather than
        // hanging silently until the first session read/write.
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      });

      // Eagerly verify the pool can reach the database.  If this rejects, the
      // error is caught below and we fall through to the file store with a
      // clear log message instead of silently losing sessions.
      pool.connect().then((client: { release: () => void }) => {
        client.release();
        logger.info('[Session] Postgres session store connected successfully');
      }).catch((err: Error) => {
        logger.error(`[Session] Postgres pool connection test failed: ${err.message}`);
      });

      // Attach an error listener so pool-level errors (e.g. primary failover
      // during a Patroni switchover) are surfaced in logs rather than crashing
      // the process with an unhandled 'error' event.
      pool.on('error', (err: Error) => {
        logger.error(`[Session] Postgres session pool error: ${err.message}`);
      });

      const store = new pgSession({
        pool,
        tableName: 'session',
        // Automatically CREATE the session table on first use if it doesn't
        // exist.  This removes the need for a manual migration step and ensures
        // the table is present even after a fresh database provision.
        createTableIfMissing: true,
      });

      logger.info('[Session] Postgres session store initialised (table: session)');
      return store;
    } catch (err) {
      // Log the real error so it appears in Railway's log stream — previously
      // this was swallowed silently, making it impossible to diagnose why
      // sessions were falling back to the file store in production.
      logger.error(`[Session] Failed to initialise Postgres session store: ${(err as Error).message}`);
      logger.warn('[Session] Falling back to file-based session store — sessions will NOT persist across instances');
    }
  }

  // Local non-Postgres dev: file-based store so sessions survive restarts
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileStore = require('session-file-store')(session);
    const sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
    logger.info(`[Session] Using file-based session store at ${sessionsDir}`);
    return new FileStore({ path: sessionsDir, ttl: 60 * 60 * 24 * 7, retries: 1, logFn: () => {} });
  } catch (err) {
    logger.error(`[Session] Failed to initialise file session store: ${(err as Error).message}`);
    logger.warn('[Session] Falling back to in-memory session store — sessions will be lost on restart');
    return undefined; // last resort: in-memory (dev only)
  }
}

const store = buildStore();
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// In production, refuse to boot with a missing or default session secret —
// a predictable secret lets anyone forge a session cookie.
const secret = process.env.SESSION_SECRET;
if (isProduction && (!secret || secret === 'change-this-secret')) {
  throw new Error(
    'SESSION_SECRET must be set to a long random value in production. Refusing to start with an insecure session secret.'
  );
}

// Warn loudly if we're in production but ended up without a Postgres-backed
// store — this means sessions will be lost between requests/instances and
// users will be logged out on every redirect.
const dbUrl = process.env.DATABASE_URL || '';
if (isProduction && dbUrl.startsWith('postgres') && !store) {
  logger.error(
    '[Session] CRITICAL: Running in production with DATABASE_URL set but no Postgres session store could be created. ' +
    'Sessions will not persist — users will be logged out after every redirect.'
  );
} else if (!store) {
  logger.warn('[Session] No persistent session store available — using in-memory store (dev only)');
}

const sessionConfig: session.SessionOptions = {
  ...(store ? { store } : {}),
  secret: secret || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,                 // HTTPS-only in production
    sameSite: 'lax',                       // same-site app — lax keeps logins working
    maxAge: 1000 * 60 * 60 * 24 * 7,       // 7 days
  },
};

export default sessionConfig;
