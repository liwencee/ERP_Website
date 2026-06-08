import session from 'express-session';
import FileStore from 'session-file-store';
import path from 'path';
import fs from 'fs';

const FileStoreSession = FileStore(session);

// Ensure sessions directory exists
const sessionsDir = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

const sessionConfig: session.SessionOptions = {
  store: new FileStoreSession({
    path: sessionsDir,
    ttl: 60 * 60 * 24 * 7,   // 7 days in seconds
    retries: 1,
    logFn: () => {},           // silence verbose file-store logs
  }),
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days in ms
  },
};

export default sessionConfig;
