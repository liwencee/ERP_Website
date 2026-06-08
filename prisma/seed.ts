import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const adminHash = await bcrypt.hash('admin123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@epraccess.com' },
    update: {},
    create: {
      email: 'admin@epraccess.com',
      password: adminHash,
      firstName: 'Admin',
      lastName: 'EPR',
      role: 'ADMIN',
      emailVerified: true,
      kycStatus: 'APPROVED',
      wallet: { create: { balance: 0 } },
    },
  });
  console.log('Admin created:', admin.email);

  // Demo investor
  const investorHash = await bcrypt.hash('investor123', 12);
  const investor = await prisma.user.upsert({
    where: { email: 'demo@investor.com' },
    update: {},
    create: {
      email: 'demo@investor.com',
      password: investorHash,
      firstName: 'Demo',
      lastName: 'Investor',
      role: 'INVESTOR',
      emailVerified: true,
      kycStatus: 'APPROVED',
      wallet: { create: { balance: 500000 } },
    },
  });
  console.log('Demo investor created:', investor.email);

  // Investment plans
  // Investment structure from EPR Access Limited official rate tables.
  // Each tier offers multiple tenures (6 months / 9 months / 1 year & above),
  // each with its own total return rate. The plan-level returnRate/duration
  // is the headline (1-year) value used for display and as a fallback.
  const tenures = (
    six: number, nine: number, year: number, ref: number,
    sixDays = 180, nineDays = 270, yearDays = 365,
    sixLabel = '6 Months', nineLabel = '9 Months', yearLabel = '1 Year & Above'
  ) => [
    { label: sixLabel,  durationDays: sixDays,  returnRate: six,  referralRate: ref, sortOrder: 1 },
    { label: nineLabel, durationDays: nineDays, returnRate: nine, referralRate: ref, sortOrder: 2 },
    { label: yearLabel, durationDays: yearDays, returnRate: year, referralRate: ref, sortOrder: 3 },
  ];

  const plans = [
    // ── Savings Plan ────────────────────────────────────────────────────────
    {
      name: 'Save Future – My Savings Plan',
      type: 'SAVINGS' as const,
      description: 'A structured savings plan with fixed contributions toward a specific goal. Funds are placed in low-risk money market instruments and fixed deposits to grow steadily while preserving capital. Withdraw any time, any day — flexibility that fits your cash flow.',
      minAmount: 10000,
      maxAmount: null,
      returnRate: 10.5,
      duration: 365,
      tenures: tenures(5.5, 8, 10.5, 3),
    },
    // ── Investment Tiers ────────────────────────────────────────────────────
    {
      name: 'Silver – My Investment SPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Entry-level plan designed for first-time investors and those building capital steadily. Focuses on capital preservation with modest, stable returns through low-risk money market and short-term fixed income instruments.',
      minAmount: 50000,
      maxAmount: 5000000,
      returnRate: 30,
      duration: 365,
      tenures: tenures(12, 16.5, 30, 2),
    },
    {
      name: 'Bronze – My Investment BPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Mid-tier plan for investors seeking balanced growth and security. Combines money market assets with diversified fixed income to deliver consistent returns while maintaining liquidity and low volatility.',
      minAmount: 5000001,
      maxAmount: 15000000,
      returnRate: 33,
      duration: 365,
      tenures: tenures(14.5, 17, 33, 1),
    },
    {
      name: 'Gold – My Investment GPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Premium plan for clients looking for higher returns with managed risk. Allocates across money markets, corporate bonds, and select equities to optimize growth while maintaining disciplined risk control.',
      minAmount: 15000001,
      maxAmount: 50000000,
      returnRate: 36,
      duration: 365,
      tenures: tenures(17, 20, 36, 0.8),
    },
    {
      name: 'Diamond – My Investment DPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Top-tier plan for high-net-worth clients and institutions. Offers a fully diversified portfolio across multiple asset classes and markets, focused on long-term wealth preservation, capital appreciation, and tailored advisory support.',
      minAmount: 50000001,
      maxAmount: null,
      returnRate: 39,
      duration: 365,
      tenures: tenures(19.5, 22, 39, 0.65),
    },
    // ── Fixed Deposit ────────────────────────────────────────────────────────
    {
      name: 'Fixed Deposit – Stop Unnecessary Spending',
      type: 'FIXED_DEPOSIT' as const,
      description: 'A low-risk investment placing funds for a set period at a pre-agreed interest rate. Capital is preserved and returns are predictable, unaffected by market swings.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 14.5,
      duration: 360,
      tenures: tenures(8, 11.5, 14.5, 2, 180, 270, 360, '30–180 Days', '270 Days', '360 Days & Above'),
    },
    // ── Trading Investment ───────────────────────────────────────────────────
    {
      name: 'Trading Investment – Earn Faster',
      type: 'TRADING' as const,
      description: 'Dynamic profit-sharing trading investment across Forex, stocks, indices, commodities and cryptocurrency. Returns are profit-shared by capital tier: ₦100K–₦10M earns 60% (referral 2.5%), ₦10M–₦25M earns 63%, ₦25M–₦50M earns 66%, ₦50M–₦80M earns 69%, ₦80M–₦120M earns 72%, ₦120M+ earns 75% of generated trading profits.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 60,
      duration: 180,
      tenures: [
        { label: '6 Months',       durationDays: 180, returnRate: 60, referralRate: 2.5, sortOrder: 1 },
        { label: '9 Months',       durationDays: 270, returnRate: 60, referralRate: 2.5, sortOrder: 2 },
        { label: '1 Year & Above', durationDays: 365, returnRate: 60, referralRate: 2.5, sortOrder: 3 },
      ],
    },
    // ── Dollar Investment ────────────────────────────────────────────────────
    {
      name: 'Dollar Investment – Foreign Currency',
      type: 'DOLLAR' as const,
      description: 'Place capital in USD-denominated assets to protect against naira devaluation and generate returns in a stable currency. Options include US dollar money market funds, Eurobonds, offshore equities and USD-denominated fixed income instruments. Provides currency hedge, stability and access to global markets. Minimum: $50.',
      minAmount: 50000,   // approximate NGN equivalent of $50 at time of seed
      maxAmount: null,
      returnRate: 5,
      duration: 365,
      tenures: [
        { label: '6 Months',       durationDays: 180, returnRate: 5, referralRate: 2, sortOrder: 1 },
        { label: '9 Months',       durationDays: 270, returnRate: 5, referralRate: 2, sortOrder: 2 },
        { label: '1 Year & Above', durationDays: 365, returnRate: 5, referralRate: 2, sortOrder: 3 },
      ],
    },
    // ── Real Estate ──────────────────────────────────────────────────────────
    {
      name: 'Real Estate Investment',
      type: 'REAL_ESTATE' as const,
      description: 'Invest in a diversified portfolio of prime Nigerian real estate within a $56B market. Benefit from rental income and capital appreciation through structured project financing and equity placement — no direct property management required.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 18,
      duration: 365,
      tenures: [
        { label: '1 Year', durationDays: 365, returnRate: 18, referralRate: 1, sortOrder: 1 },
      ],
    },
  ];

  // Clear and recreate plans for idempotency (cascade removes old tenures)
  await prisma.userInvestment.deleteMany({});
  await prisma.planTenure.deleteMany({});
  await prisma.investmentPlan.deleteMany({});
  for (const plan of plans) {
    const { tenures: planTenures, ...planData } = plan;
    const created = await prisma.investmentPlan.create({
      data: { ...planData, tenures: { create: planTenures } },
    });
    console.log(`Plan created: ${created.name} (${planTenures.length} tenures)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
