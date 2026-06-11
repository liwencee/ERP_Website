/**
 * SUPER TEST ACCOUNTS — safe to share with your team.
 *
 * Run any time to (re)create the accounts:
 *   npx ts-node prisma/test-accounts.ts
 *
 * Idempotent: re-running resets the password, KYC, status and wallet
 * balance back to the known-good values below — so even if a teammate
 * changes something, you can restore a clean state in seconds.
 *
 * These accounts are also baked into the main seed (prisma/seed.ts),
 * so `npx ts-node prisma/seed.ts` recreates them too.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ── Edit these if you want different credentials ──────────────────────
export const ACCOUNTS = [
  {
    email: 'admin@epraccess.com',
    password: 'EprAdmin2026!',
    firstName: 'EPR',
    lastName: 'Administrator',
    role: 'ADMIN',
    referralCode: 'EPRADMIN',
    walletBalance: 5_000_000,
  },
  {
    email: 'staff@epraccess.com',
    password: 'EprStaff2026!',
    firstName: 'EPR',
    lastName: 'Staff',
    role: 'STAFF',
    referralCode: 'EPRSTAFF',
    walletBalance: 0,
  },
  {
    email: 'investor@epraccess.com',
    password: 'EprInvest2026!',
    firstName: 'Test',
    lastName: 'Investor',
    role: 'INVESTOR',
    referralCode: 'EPRTEST1',
    // Funded high enough to test EVERY tier, incl. Diamond (min ₦50,000,001)
    walletBalance: 200_000_000,
  },
];
// ──────────────────────────────────────────────────────────────────────

export async function upsertTestAccounts(prisma: PrismaClient): Promise<void> {
  for (const a of ACCOUNTS) await upsertAccount(prisma, a);
}

async function upsertAccount(prisma: PrismaClient, a: (typeof ACCOUNTS)[number]) {
  const hash = await bcrypt.hash(a.password, 12);

  const user = await prisma.user.upsert({
    where: { email: a.email },
    update: {
      password: hash,
      firstName: a.firstName,
      lastName: a.lastName,
      role: a.role,
      status: 'ACTIVE',
      emailVerified: true,
      kycStatus: 'APPROVED',
      referralCode: a.referralCode,
      sessionVersion: { increment: 1 }, // force any stale sessions to re-login
    },
    create: {
      email: a.email,
      password: hash,
      firstName: a.firstName,
      lastName: a.lastName,
      role: a.role,
      status: 'ACTIVE',
      emailVerified: true,
      kycStatus: 'APPROVED',
      referralCode: a.referralCode,
    },
  });

  // Ensure wallet exists and reset its balance to the known-good value
  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: { balance: a.walletBalance },
    create: { userId: user.id, balance: a.walletBalance },
  });

  console.log(
    `✓ ${a.role.padEnd(8)} ${a.email.padEnd(28)} pw: ${a.password.padEnd(16)} wallet: ₦${a.walletBalance.toLocaleString()}`
  );
}

// Run directly (npx ts-node prisma/test-accounts.ts) — not when imported by seed
if (require.main === module) {
  const prisma = new PrismaClient();
  (async () => {
    console.log('\n=== EPR Access — Super Test Accounts ===\n');
    await upsertTestAccounts(prisma);
    console.log('\nAll set. These work on the live site immediately.\n');
  })()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
