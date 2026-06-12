import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Non-destructive: the Dollar plan now takes amounts in USD, so its minimum is
// $50 (not the old ₦50,000 placeholder). Only updates that one plan's minAmount.
async function main() {
  const res = await prisma.investmentPlan.updateMany({
    where: { type: 'DOLLAR' },
    data: { minAmount: 50 },
  });
  console.log(`Dollar plan minAmount set to 50 (rows updated: ${res.count})`);

  const p = await prisma.investmentPlan.findFirst({
    where: { type: 'DOLLAR' },
    select: { name: true, minAmount: true, maxAmount: true },
  });
  console.log('verify:', JSON.stringify(p));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
