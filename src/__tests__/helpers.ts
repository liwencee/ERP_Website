import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createTestUser(overrides: Partial<{
  email: string;
  password: string;
  role: string;
  emailVerified: boolean;
  referralCode: string;
}> = {}) {
  const email = overrides.email ?? `test_${Date.now()}@example.com`;
  const password = overrides.password ?? 'TestPass123!';
  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hash,
      firstName: 'Test',
      lastName: 'User',
      phone: '+2348000000000',
      role: overrides.role ?? 'INVESTOR',
      emailVerified: overrides.emailVerified ?? true,
      referralCode: overrides.referralCode ?? `EPRTEST${Date.now().toString(36).toUpperCase()}`,
      wallet: { create: { balance: 0 } },
    },
  });

  return { user, plainPassword: password };
}

export async function createTestAdmin() {
  return createTestUser({
    email: `admin_${Date.now()}@example.com`,
    role: 'ADMIN',
    emailVerified: true,
  });
}

export async function seedTestPlan() {
  return prisma.investmentPlan.create({
    data: {
      name: 'Test Fixed Plan',
      type: 'FIXED_DEPOSIT',
      description: 'A test fixed deposit plan for testing purposes.',
      minAmount: 10000,
      maxAmount: 1000000,
      returnRate: 15,
      duration: 90,
      status: 'ACTIVE',
    },
  });
}

export async function cleanDb() {
  await prisma.notification.deleteMany();
  await prisma.document.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.userInvestment.deleteMany();
  await prisma.investmentPlan.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
}

export { prisma };
