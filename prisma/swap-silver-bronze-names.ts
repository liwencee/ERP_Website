import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// One-off: swap ONLY the `name` between the two tier rows so the entry-level
// plan (₦50,000–₦5,000,000) is named "Bronze" and the mid-tier
// (₦5,000,001–₦15,000,000) is named "Silver". Descriptions are NOT swapped —
// each row's description describes its band, which does not move. Amount bands,
// return rates, tenures and every UserInvestment are left untouched — investors
// stay linked to the same row and therefore re-label automatically. Symmetric:
// re-running swaps the names back.
//
// Run against the LIVE DB (never hardcode the password):
//   DATABASE_URL="postgres://...proxy.rlwy.net:PORT/railway" \
//     npx tsx prisma/swap-silver-bronze-names.ts
async function main() {
  const silver = await prisma.investmentPlan.findFirst({ where: { name: { contains: 'Silver' } } });
  const bronze = await prisma.investmentPlan.findFirst({ where: { name: { contains: 'Bronze' } } });

  if (!silver || !bronze) {
    throw new Error(`Could not find both tiers (silver=${!!silver}, bronze=${!!bronze}). Aborting.`);
  }

  console.log('--- BEFORE ---');
  for (const p of [silver, bronze]) {
    console.log(`${p.name} | min=${p.minAmount} max=${p.maxAmount} return=${p.returnRate}%`);
    const holders = await prisma.userInvestment.findMany({
      where: { planId: p.id },
      include: { user: { select: { email: true } } },
    });
    console.log(`  holders (${holders.length}): ${holders.map((h) => h.user.email).join(', ') || 'none'}`);
  }

  await prisma.$transaction([
    prisma.investmentPlan.update({
      where: { id: silver.id },
      data: { name: bronze.name },
    }),
    prisma.investmentPlan.update({
      where: { id: bronze.id },
      data: { name: silver.name },
    }),
  ]);

  console.log('--- AFTER ---');
  const after = await prisma.investmentPlan.findMany({
    where: { id: { in: [silver.id, bronze.id] } },
    orderBy: { minAmount: 'asc' },
    select: { name: true, minAmount: true, maxAmount: true, returnRate: true },
  });
  for (const p of after) {
    console.log(`${p.name} | min=${p.minAmount} max=${p.maxAmount} return=${p.returnRate}%`);
  }
  console.log('Swap complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
