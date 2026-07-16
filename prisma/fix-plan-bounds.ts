import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ⚠️ DO NOT RE-RUN after the Silver↔Bronze rename (swap-silver-bronze-names.ts).
// It matches by the name substring "Bronze" and writes a mid-tier minAmount;
// since the rename "Bronze" is the ENTRY-LEVEL band, so re-running would corrupt
// it. Historical record only — the "Safe to run repeatedly" note below predates
// the rename and no longer holds.
//
// Non-destructive: updates ONLY the minAmount on the three affected tiers so the
// boundaries are clean round numbers (no ugly +1). Tenures, returns and existing
// user investments are left completely untouched. Safe to run repeatedly.
async function main() {
  const updates: { contains: string; minAmount: number }[] = [
    { contains: 'Bronze', minAmount: 5000000 },
    { contains: 'Gold', minAmount: 15000000 },
    { contains: 'Diamond', minAmount: 50000000 },
  ];

  for (const u of updates) {
    const res = await prisma.investmentPlan.updateMany({
      where: { name: { contains: u.contains } },
      data: { minAmount: u.minAmount },
    });
    console.log(`${u.contains}: set minAmount=${u.minAmount} (rows updated: ${res.count})`);
  }

  console.log('--- verify ---');
  const plans = await prisma.investmentPlan.findMany({
    where: { type: 'STOCK_EQUITY' },
    orderBy: { minAmount: 'asc' },
    select: { name: true, minAmount: true, maxAmount: true },
  });
  for (const p of plans) console.log(`${p.name} | min=${p.minAmount} | max=${p.maxAmount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
