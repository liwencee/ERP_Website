import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// One-off: a deposit was confirmed with a mistyped backdate (2026-09-09,
// genuinely in the future) via the free-text backdate prompt in
// admin/transactions, which sorted it to the top of every transaction list
// ahead of everything actually recent. Its updatedAt (2026-06-21) is the
// database's own record of when it was actually processed — correcting
// createdAt to match that removes the future date and restores correct
// chronological ordering. Targeted by reference so only this exact row is
// touched.
//
// Run against the LIVE DB (never hardcode the password):
//   DATABASE_URL="postgres://...proxy.rlwy.net:PORT/railway" \
//     npx tsx prisma/fix-oluwasina-toba-date.ts
async function main() {
  const REFERENCE = 'BNK-1782041038424-87EE6698';

  const tx = await prisma.transaction.findUnique({ where: { reference: REFERENCE } });
  if (!tx) {
    throw new Error(`Transaction ${REFERENCE} not found. Aborting.`);
  }

  console.log('--- BEFORE ---');
  console.log(`ref=${tx.reference} createdAt=${tx.createdAt.toISOString()} updatedAt=${tx.updatedAt.toISOString()}`);

  const correctedDate = tx.updatedAt;

  const updated = await prisma.transaction.update({
    where: { reference: REFERENCE },
    data: { createdAt: correctedDate },
  });

  console.log('\n--- AFTER ---');
  console.log(`ref=${updated.reference} createdAt=${updated.createdAt.toISOString()} updatedAt=${updated.updatedAt.toISOString()}`);
  console.log('\nDone.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
