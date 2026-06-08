import { execSync } from 'child_process';
import fs from 'fs';

module.exports = async () => {
  process.env.DATABASE_URL = 'file:./prisma/test.db';

  // Remove stale test DB
  const dbPath = './prisma/test.db';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  // Push schema to fresh test DB
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
    stdio: 'pipe',
  });
};
