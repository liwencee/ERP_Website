import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Non-overlapping tier bands using the "upper range" convention: the boundary
// amount belongs to the LOWER tier, and each higher tier starts ₦1 above the
// previous tier's max. Only minAmount changes; maxAmount, Silver, tenures,
// returns and existing user investments are left untouched. Safe to re-run.
//
//   Silver  : ₦50,000     – ₦5,000,000   (unchanged)
//   Bronze  : ₦5,000,001  – ₦15,000,000
//   Gold    : ₦15,000,001 – ₦50,000,000
//   Diamond : ₦50,000,001 & above
//
// Run against the LIVE DB by passing the public proxy URL as an env-var prefix
// (never hardcode the password):
//   DATABASE_URL="postgres://...@turntable.proxy.rlwy.net:PORT/railway" \
//     npx tsx prisma/set-tier-upper-range.ts
async function main() {
  const updates: { contains: string; minAmount: number }[] = [
    { contains: 'Bronze', minAmount: 5000001 },
    { contains: 'Gold', minAmount: 15000001 },
    { contains: 'Diamond', minAmount: 50000001 },
  ];

  for (const u of updates) {
    const res = await prisma.investmentPlan.updateMany({
      where: { name: { contains: u.contains } },
      data: { minAmount: u.minAmount },
    });
    console.log(`${u.contains}: set minAmount=${u.minAmount} (rows updated: ${res.count})`);
  }

  console.log('--- verify (tiers, ascending) ---');
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
