import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Additively adds nullable bank-detail columns without touching the
// connect-pg-simple "session" table (which `prisma db push` would drop).
async function main() {
  const stmts = [
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bankName" TEXT',
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT',
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT',
    'ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "bankName" TEXT',
    'ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT',
    'ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT',
  ];
  for (const sql of stmts) {
    await prisma.$executeRawUnsafe(sql);
    console.log('OK:', sql);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
