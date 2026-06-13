import session from 'express-session';
import path from 'path';
import fs from 'fs';

function buildStore(): session.Store | undefined {
  const dbUrl = process.env.DATABASE_URL || '';

  // Postgres-backed sessions whenever a Postgres DB is configured.
  // Critical on Vercel: serverless function instances don't share memory,
  // so an in-memory store loses sessions between requests. A shared DB
  // store keeps users logged in across every invocation.
  if (dbUrl.startsWith('postgres')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pgSession = require('connect-pg-simple')(session);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        max: 3,
      });
      return new pgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true,
      });
    } catch {
      // fall through to file/memory store
    }
  }

  // Local non-Postgres dev: file-based store so sessions survive restarts
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileStore = require('session-file-store')(session);
    const sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
    return new FileStore({ path: sessionsDir, ttl: 60 * 60 * 24 * 7, retries: 1, logFn: () => {} });
  } catch {
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
