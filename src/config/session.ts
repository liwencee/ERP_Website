import session from 'express-session';
import path from 'path';
import fs from 'fs';

function buildStore(): session.Store | undefined {
  // Vercel / serverless: no persistent filesystem — use in-memory store.
  // For production with real persistence use Upstash Redis + connect-redis.
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return undefined; // express-session default in-memory store
  }

  // Local dev: file-based store so sessions survive server restarts
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileStore = require('session-file-store')(session);
    const sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
    return new FileStore({ path: sessionsDir, ttl: 60 * 60 * 24 * 7, retries: 1, logFn: () => {} });
  } catch {
    return undefined; // fallback silently
  }
}

const store = buildStore();

const sessionConfig: session.SessionOptions = {
  ...(store ? { store } : {}),
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
};

export default sessionConfig;
