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
  // Rates shown are the headline 1-year-and-above rate for each tier.
  // (Tiers also offer 6-month and 9-month tenures at lower rates.)
  const plans = [
    {
      name: 'Save Future — My Savings Plan',
      type: 'SAVINGS' as const,
      description: 'A structured savings plan with fixed contributions toward a specific goal. Funds are placed in low-risk money market instruments and fixed deposits to grow steadily while preserving capital. Withdraw any time, any day — flexibility that fits your cash flow. Rates: 5.5% (6 months), 8% (9 months), 10.5% (1 year & above).',
      minAmount: 10000,
      maxAmount: null,
      returnRate: 10.5,
      duration: 365,
    },
    {
      name: 'Silver — My Investment SPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Entry investment tier for those building capital steadily. Balances money market assets with diversified fixed income for consistent returns and low volatility. Rates: 12% (6 months), 16.5% (9 months), 30% (1 year & above). Referral bonus 2%.',
      minAmount: 50000,
      maxAmount: 5000000,
      returnRate: 30,
      duration: 365,
    },
    {
      name: 'Bronze — My Investment BPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Mid-tier plan for investors seeking balanced growth and security. Combines money market and diversified fixed income to deliver consistent returns while maintaining liquidity. Rates: 14.5% (6 months), 17% (9 months), 33% (1 year & above). Referral bonus 1%.',
      minAmount: 5000001,
      maxAmount: 15000000,
      returnRate: 33,
      duration: 365,
    },
    {
      name: 'Gold — My Investment GPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Premium plan for clients seeking higher returns with managed risk. Allocates across money markets, corporate bonds and select equities to optimise growth with disciplined risk control. Rates: 17% (6 months), 20% (9 months), 36% (1 year & above). Referral bonus 0.80%.',
      minAmount: 15000001,
      maxAmount: 50000000,
      returnRate: 36,
      duration: 365,
    },
    {
      name: 'Diamond — My Investment DPlus',
      type: 'STOCK_EQUITY' as const,
      description: 'Top-tier plan for high-net-worth clients and institutions. A fully diversified portfolio across multiple asset classes and markets, focused on long-term wealth preservation and capital appreciation with tailored advisory support. Rates: 19.5% (6 months), 22% (9 months), 39% (1 year & above). Referral bonus 0.65%.',
      minAmount: 50000001,
      maxAmount: null,
      returnRate: 39,
      duration: 365,
    },
    {
      name: 'Fixed Deposit — Stop Unnecessary Spending',
      type: 'FIXED_DEPOSIT' as const,
      description: 'A low-risk investment placing funds for a set period at a pre-agreed interest rate. Capital is preserved and returns are predictable, unaffected by market swings. Rates: 8% (30–180 days), 11.5% (270 days), 14.5% (360 days & above). Referral bonus 2%.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 14.5,
      duration: 360,
    },
    {
      name: 'Real Estate Investment Fund',
      type: 'REAL_ESTATE' as const,
      description: 'Invest in a diversified portfolio of prime Nigerian real estate within a $56B market. Benefit from rental income and capital appreciation through structured project financing and equity placement — no direct property management required.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 18,
      duration: 365,
    },
  ];

  // Clear and recreate plans for idempotency
  await prisma.investmentPlan.deleteMany({});
  for (const plan of plans) {
    const created = await prisma.investmentPlan.create({ data: plan });
    console.log('Plan created:', created.name);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
