import { PrismaClient } from '@prisma/client';

// Additively adds the nullable `emailTokenExp` column to "User" so email
// verification links can carry a 10-minute expiry. Mirrors add-bank-columns.ts:
// raw idempotent SQL only, so the connect-pg-simple "session" table is never
// touched (which `prisma db push` would try to DROP, logging everyone out).
//
// Run against the LIVE database via:
//   railway run --service "Postgres HA" npx ts-node prisma/add-email-token-exp.ts
// Railway injects DATABASE_PUBLIC_URL (the proxy, reachable off the private
// network) so the live credentials are never written into a file.
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(
    'No database URL. DATABASE_* keys present:',
    Object.keys(process.env).filter((k) => k.includes('DATABASE')),
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailTokenExp" TIMESTAMP(3)',
  );
  console.log('OK: "User"."emailTokenExp" ensured');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
