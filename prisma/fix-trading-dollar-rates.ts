import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Non-destructive: corrects two PlanTenure.returnRate inconsistencies found
// during the daily-accrual audit. No UserInvestment rows exist yet, so this
// only affects rates offered to future investors — nothing already stored
// (expectedReturn, maturityDate, etc.) is touched. Safe to run repeatedly.
//
// 1) Trading Investment was flat 60% at every tenure (180-1825 days), so the
//    implied daily rate (rate/durationDays) collapsed ~10x from 6mo to 5yr.
//    Fix: treat 60% as the 1-Year rate and scale linearly like every other
//    plan (rate(n years) = rate(1yr) * n).
// 2) Dollar Investment's 6mo/9mo tenures were pegged at the same 5% as the
//    1-Year rate (instead of being time-proportional like its own 1yr-5yr
//    tenures, and like every other plan's 6mo/9mo tenures).
//    Fix: scale down proportionally to the 1yr rate (5% / 365 days).
async function main() {
  const updates: { plan: string; label: string; returnRate: number }[] = [
    { plan: 'Trading', label: '6 Months', returnRate: 30 },
    { plan: 'Trading', label: '9 Months', returnRate: 45 },
    { plan: 'Trading', label: '2 Years',  returnRate: 120 },
    { plan: 'Trading', label: '3 Years',  returnRate: 180 },
    { plan: 'Trading', label: '4 Years',  returnRate: 240 },
    { plan: 'Trading', label: '5 Years',  returnRate: 300 },
    { plan: 'Dollar',  label: '6 Months', returnRate: 2.5 },
    { plan: 'Dollar',  label: '9 Months', returnRate: 3.75 },
  ];

  for (const u of updates) {
    const res = await prisma.planTenure.updateMany({
      where: { label: u.label, plan: { name: { contains: u.plan } } },
      data: { returnRate: u.returnRate },
    });
    console.log(`${u.plan} / ${u.label}: set returnRate=${u.returnRate}% (rows updated: ${res.count})`);
  }

  console.log('\n--- verify ---');
  const plans = await prisma.investmentPlan.findMany({
    where: { OR: [{ name: { contains: 'Trading' } }, { name: { contains: 'Dollar' } }] },
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
  });
  for (const p of plans) {
    console.log(`\n${p.name}`);
    for (const t of p.tenures) {
      const rate = Number(t.returnRate);
      console.log(`  ${t.label.padEnd(10)} rate=${String(rate).padStart(6)}% over ${String(t.durationDays).padStart(4)} days | daily(rate/days)=${(rate / t.durationDays).toFixed(6)}%/day`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
