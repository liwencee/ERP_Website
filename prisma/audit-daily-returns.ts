import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Read-only audit: independently recomputes expectedReturn, maturityDate
// duration, daily accrual rate, and the live "Investment Value" formula
// (home.controller.ts) for every plan/tenure and every investment, then
// flags any mismatch. Makes no writes.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  console.log('=== PLAN / TENURE RATE TABLE ===');
  console.log('Showing: total return % over the tenure, the tenure length in days,');
  console.log('the implied DAILY rate (rate / durationDays), and rate/365 for comparison.\n');

  const plans = await prisma.investmentPlan.findMany({
    include: { tenures: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { type: 'asc' },
  });

  for (const plan of plans) {
    console.log(`\n${plan.name} [${plan.type}] — status=${plan.status}`);
    if (plan.tenures.length === 0) {
      const rate = Number(plan.returnRate);
      const days = plan.duration;
      console.log(`  (no tenures — plan headline) rate=${rate}% over ${days} days | daily=${(rate / days).toFixed(6)}%/day | rate/365=${(rate / 365).toFixed(6)}%/day`);
      continue;
    }
    for (const t of plan.tenures) {
      const rate = Number(t.returnRate);
      const days = t.durationDays;
      const dailyOverDuration = rate / days;
      const dailyOver365 = rate / 365;
      console.log(`  ${t.label.padEnd(16)} rate=${String(rate).padStart(6)}% over ${String(days).padStart(4)} days | daily(rate/days)=${dailyOverDuration.toFixed(6)}%/day | rate/365=${dailyOver365.toFixed(6)}%/day | referral=${Number(t.referralRate)}%`);
    }
  }

  console.log('\n\n=== INVESTMENT AUDIT (every UserInvestment) ===\n');

  const investments = await prisma.userInvestment.findMany({
    include: {
      plan: true,
      tenure: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total investments: ${investments.length}\n`);

  const now = Date.now();
  let flaggedCount = 0;
  let totalCurrentValue = 0;
  let totalPrincipalActive = 0;

  for (const inv of investments) {
    const rate = inv.tenure ? Number(inv.tenure.returnRate) : Number(inv.plan.returnRate);
    const expectedDurationDays = inv.tenure ? inv.tenure.durationDays : inv.plan.duration;

    const principal = Number(inv.amount);
    const storedExpected = Number(inv.expectedReturn);
    const recomputedExpected = round2(principal * (1 + rate / 100));

    const start = new Date(inv.startDate).getTime();
    const end = new Date(inv.maturityDate).getTime();
    const actualDurationDays = (end - start) / MS_PER_DAY;

    const expectedMatch = Math.abs(storedExpected - recomputedExpected) < 0.01;
    const durationMatch = Math.abs(actualDurationDays - expectedDurationDays) < 0.01;

    const dailyRatePercent = rate / expectedDurationDays;
    const dailyAmount = round2(principal * dailyRatePercent / 100);

    // Live formula from home.controller.ts
    const totalMs = end - start;
    const elapsed = Math.min(Math.max(now - start, 0), totalMs > 0 ? totalMs : 0);
    const progress = totalMs > 0 ? elapsed / totalMs : 1;
    const currentValue = principal + (storedExpected - principal) * progress;
    const daysElapsed = elapsed / MS_PER_DAY;

    const flags: string[] = [];
    if (!expectedMatch) flags.push(`expectedReturn MISMATCH: stored=${storedExpected} recomputed(at current rate ${rate}%)=${recomputedExpected}`);
    if (!durationMatch) flags.push(`maturityDate duration MISMATCH: actual=${actualDurationDays.toFixed(4)}d expected=${expectedDurationDays}d`);

    const tag = flags.length ? 'FLAG' : 'ok  ';
    if (flags.length) flaggedCount++;

    console.log(
      `[${tag}] ${inv.id.slice(0, 8)} | ${inv.user.firstName} ${inv.user.lastName} | ${inv.plan.name}${inv.tenure ? ' / ' + inv.tenure.label : ''} | ` +
      `principal=₦${principal.toLocaleString()} rate=${rate}% days=${expectedDurationDays} | ` +
      `expected=₦${storedExpected.toLocaleString()} (recomputed=₦${recomputedExpected.toLocaleString()}) | ` +
      `daily=₦${dailyAmount.toLocaleString()} (${dailyRatePercent.toFixed(6)}%/day) | ` +
      `status=${inv.status} daysElapsed=${daysElapsed.toFixed(2)}/${expectedDurationDays} progress=${(progress * 100).toFixed(2)}% | ` +
      `currentValue=₦${round2(currentValue).toLocaleString()}`
    );
    for (const f of flags) console.log(`        -> ${f}`);

    if (inv.status === 'ACTIVE') {
      totalCurrentValue += currentValue;
      totalPrincipalActive += principal;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total investments audited: ${investments.length}`);
  console.log(`Flagged (mismatch): ${flaggedCount}`);
  console.log(`Active principal total: ₦${round2(totalPrincipalActive).toLocaleString()}`);
  console.log(`Active current-value total: ₦${round2(totalCurrentValue).toLocaleString()}`);
  console.log(`Active returns-earned-so-far total: ₦${round2(totalCurrentValue - totalPrincipalActive).toLocaleString()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
