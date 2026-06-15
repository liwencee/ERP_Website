import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Non-destructive: corrects an off-by-one (...001) lower bound on Bronze and
// Gold so that clean amounts (5,200,000 / 15,000,000) are accepted instead of
// rejected, and confirms Gold's upper bound at 50,000,000. Tenures, returns
// and existing user investments are left untouched. Safe to run repeatedly.
async function main() {
  const updates: { contains: string; minAmount: number; maxAmount?: number }[] = [
    { contains: 'Bronze', minAmount: 5200000 },
    { contains: 'Gold', minAmount: 15000000, maxAmount: 50000000 },
  ];

  for (const u of updates) {
    const data: { minAmount: number; maxAmount?: number } = { minAmount: u.minAmount };
    if (u.maxAmount !== undefined) data.maxAmount = u.maxAmount;
    const res = await prisma.investmentPlan.updateMany({
      where: { name: { contains: u.contains } },
      data,
    });
    console.log(`${u.contains}: set ${JSON.stringify(data)} (rows updated: ${res.count})`);
  }

  console.log('--- verify ---');
  const plans = await prisma.investmentPlan.findMany({
    where: { OR: [{ name: { contains: 'Bronze' } }, { name: { contains: 'Gold' } }] },
    orderBy: { minAmount: 'asc' },
    select: { name: true, minAmount: true, maxAmount: true },
  });
  for (const p of plans) console.log(`${p.name} | min=${p.minAmount} | max=${p.maxAmount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
