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
    {
      name: 'Save Future — My Savings Plan',
      type: 'SAVINGS' as const,
      description: 'A structured savings plan with fixed contributions toward a specific goal. Funds are placed in low-risk money market instruments and fixed deposits to grow steadily while preserving capital. Withdraw any time, any day — flexibility that fits your cash flow.',
      minAmount: 10000,
      maxAmount: null,
      returnRate: 10.5,
      duration: 365,
      tenures: tenures(5.5, 8, 10.5, 3),
    },
    {
      name: 'Silver — My Investment SPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Entry investment tier for those building capital steadily. Balances money market assets with diversified fixed income for consistent returns and low volatility.',
      minAmount: 50000,
      maxAmount: 5000000,
      returnRate: 30,
      duration: 365,
      tenures: tenures(12, 16.5, 30, 2),
    },
    {
      name: 'Bronze — My Investment BPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Mid-tier plan for investors seeking balanced growth and security. Combines money market and diversified fixed income to deliver consistent returns while maintaining liquidity.',
      minAmount: 5000001,
      maxAmount: 15000000,
      returnRate: 33,
      duration: 365,
      tenures: tenures(14.5, 17, 33, 1),
    },
    {
      name: 'Gold — My Investment GPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Premium plan for clients seeking higher returns with managed risk. Allocates across money markets, corporate bonds and select equities to optimise growth with disciplined risk control.',
      minAmount: 15000001,
      maxAmount: 50000000,
      returnRate: 36,
      duration: 365,
      tenures: tenures(17, 20, 36, 0.8),
    },
    {
      name: 'Diamond — My Investment DPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Top-tier plan for high-net-worth clients and institutions. A fully diversified portfolio across multiple asset classes and markets, focused on long-term wealth preservation and capital appreciation with tailored advisory support.',
      minAmount: 50000001,
      maxAmount: null,
      returnRate: 39,
      duration: 365,
      tenures: tenures(19.5, 22, 39, 0.65),
    },
    {
      name: 'Fixed Deposit — Stop Unnecessary Spending',
      type: 'FIXED_DEPOSIT' as const,
      description: 'A low-risk investment placing funds for a set period at a pre-agreed interest rate. Capital is preserved and returns are predictable, unaffected by market swings.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 14.5,
      duration: 360,
      tenures: tenures(8, 11.5, 14.5, 2, 180, 270, 360, '30–180 Days', '270 Days', '360 Days & Above'),
    },
    {
      name: 'Real Estate Investment Fund',
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
