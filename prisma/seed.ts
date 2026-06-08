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
  const plans = [
    {
      name: 'Fixed Deposit Classic',
      type: 'FIXED_DEPOSIT' as const,
      description: 'A secure, guaranteed return investment backed by fixed-income instruments. Ideal for conservative investors seeking stable, predictable returns over a defined period.',
      minAmount: 50000,
      maxAmount: 10000000,
      returnRate: 15,
      duration: 180,
    },
    {
      name: 'Real Estate Fund Alpha',
      type: 'REAL_ESTATE' as const,
      description: 'Invest in a diversified portfolio of prime Nigerian real estate properties. Benefit from rental income and capital appreciation without the hassle of direct property management.',
      minAmount: 100000,
      maxAmount: null,
      returnRate: 18,
      duration: 365,
    },
    {
      name: 'Equity Growth Portfolio',
      type: 'STOCK_EQUITY' as const,
      description: 'Professionally managed equity portfolio focused on high-growth Nigerian and international stocks. Suitable for investors with moderate risk appetite seeking above-average returns.',
      minAmount: 25000,
      maxAmount: 5000000,
      returnRate: 22,
      duration: 270,
    },
    {
      name: 'Flex Savings Plus',
      type: 'SAVINGS' as const,
      description: 'A flexible savings plan that allows you to grow your funds with competitive interest rates. Perfect for short-term savings goals and building your investment habit.',
      minAmount: 10000,
      maxAmount: 2000000,
      returnRate: 12,
      duration: 90,
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
