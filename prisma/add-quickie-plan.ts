import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// One-off: fixes up the incomplete "Quickie - Short-term Savings" plan that
// was already created on production (via the basic admin New Plan form, which
// doesn't support tenures) into the fully-specified "Quickie - Short-term
// Profit - QSP" plan — correct name/type/description/headline and its 6
// tenures. Confirmed zero investments exist under it before this was written,
// so updating in place is safe (no investor is reclassified).
// Idempotent: if the tenures already exist (re-run), it skips creating them.
//
// Run against the LIVE DB (never hardcode the password):
//   DATABASE_URL="postgres://...proxy.rlwy.net:PORT/railway" \
//     npx tsx prisma/add-quickie-plan.ts
async function main() {
  const existing = await prisma.investmentPlan.findFirst({
    where: { name: { contains: 'Quickie' } },
    include: { tenures: true },
  });
  if (!existing) {
    throw new Error('No existing Quickie plan found — expected the draft plan to already exist. Aborting.');
  }

  const investmentCount = await prisma.userInvestment.count({ where: { planId: existing.id } });
  if (investmentCount > 0) {
    throw new Error(`Refusing to update: ${investmentCount} investment(s) already exist under this plan. Aborting.`);
  }

  console.log('--- BEFORE ---');
  console.log(`${existing.name} | type=${existing.type} min=${existing.minAmount} max=${existing.maxAmount} return=${existing.returnRate}%/${existing.duration}d | tenures=${existing.tenures.length}`);

  await prisma.investmentPlan.update({
    where: { id: existing.id },
    data: {
      name: 'Quickie - Short-term Profit - QSP',
      type: 'QUICKIE',
      description:
        'A structured quickie short-term profit with deposit contributions toward a specific goal. Funds are placed in short-term within the period stipulated by the investor to accomplish the financial aim while preserving capital. Withdraw any time, any day. Termination before maturity date will not count interest — flexibility that fits your cash flow.',
      minAmount: 50000,
      maxAmount: null,
      returnRate: 13,
      duration: 180,
      status: 'ACTIVE',
    },
  });

  if (existing.tenures.length === 0) {
    await prisma.planTenure.createMany({
      data: [
        { planId: existing.id, label: '1 Month',  durationDays: 30,  returnRate: 3,  referralRate: 2, sortOrder: 1 },
        { planId: existing.id, label: '2 Months', durationDays: 60,  returnRate: 5,  referralRate: 2, sortOrder: 2 },
        { planId: existing.id, label: '3 Months', durationDays: 90,  returnRate: 7,  referralRate: 2, sortOrder: 3 },
        { planId: existing.id, label: '4 Months', durationDays: 120, returnRate: 9,  referralRate: 2, sortOrder: 4 },
        { planId: existing.id, label: '5 Months', durationDays: 150, returnRate: 11, referralRate: 2, sortOrder: 5 },
        { planId: existing.id, label: '6 Months', durationDays: 180, returnRate: 13, referralRate: 2, sortOrder: 6 },
      ],
    });
  } else {
    console.log(`Tenures already present (${existing.tenures.length}) — leaving them as-is.`);
  }

  const after = await prisma.investmentPlan.findUnique({
    where: { id: existing.id },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  console.log('\n--- AFTER ---');
  console.log(`${after!.name} | type=${after!.type} min=${after!.minAmount} max=${after!.maxAmount} headline=${after!.returnRate}%/${after!.duration}d`);
  for (const t of after!.tenures) {
    console.log(`  tenure: ${t.label} — ${t.returnRate}% (${t.durationDays} days, referral ${t.referralRate}%)`);
  }
  console.log('\nDone.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
