import { PrismaClient } from '@prisma/client';
import { canonicalEmail, normalizePhone } from '../src/utils/identity';

const prisma = new PrismaClient();

// Fills User.emailCanonical / User.phoneNormalized for accounts that existed
// before the one-person-one-account checks, so the signup guard can see them.
//
// Idempotent and non-destructive: it never changes, merges, suspends or deletes
// an account. Accounts that collapse to the same identity are all stamped and
// REPORTED (oldest listed as the original) so an admin can review them.
//
// Run: npx ts-node prisma/backfill-identity.ts   (also runs on Railway deploy)
async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, email: true, phone: true, role: true, createdAt: true,
      emailCanonical: true, phoneNormalized: true,
    },
  });

  // Keys already owned (by an earlier backfill or by new signups).
  const emailOwner = new Map<string, string>();
  const phoneOwner = new Map<string, string>();
  for (const u of users) {
    if (u.emailCanonical) emailOwner.set(u.emailCanonical, u.email);
    if (u.phoneNormalized) phoneOwner.set(u.phoneNormalized, u.email);
  }

  let filled = 0;
  const dupes: string[] = [];

  for (const u of users) {
    const data: { emailCanonical?: string; phoneNormalized?: string } = {};

    if (!u.emailCanonical) {
      const key = canonicalEmail(u.email);
      const owner = emailOwner.get(key);
      data.emailCanonical = key;
      if (!owner) emailOwner.set(key, u.email);
      else dupes.push(`EMAIL  ${u.email}  duplicates  ${owner}`);
    }

    if (!u.phoneNormalized && u.phone) {
      const key = normalizePhone(u.phone);
      if (key) {
        const owner = phoneOwner.get(key);
        data.phoneNormalized = key;
        if (!owner) phoneOwner.set(key, u.email);
        else dupes.push(`PHONE  ${u.email} (${u.phone})  duplicates  ${owner}`);
      }
    }

    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id: u.id }, data });
      filled++;
    }
  }

  console.log(`Identity backfill: ${filled} account(s) updated, ${users.length} checked.`);
  if (dupes.length) {
    console.log(`\n⚠ ${dupes.length} existing account(s) share an identity with an older account (oldest is the original — review for admin action):`);
    dupes.forEach((d) => console.log('  ' + d));
  }
}

main()
  .catch((e) => {
    // Never block a deploy over a reporting/backfill step.
    console.error('Identity backfill failed:', e);
  })
  .finally(() => prisma.$disconnect());
