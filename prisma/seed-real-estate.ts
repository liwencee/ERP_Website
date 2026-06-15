import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Idempotent: matches existing rows by title and updates them, otherwise
// creates a new row. Safe to run repeatedly.
const properties = [
  {
    title: '5 Bedroom Fully Detached With BQ',
    location: 'Ajah Lagos, General Paint bus-stop by Abraham Adesanya Road, before Lagos Business School, Lagos State',
    price: 350000000,
    currency: 'NGN',
    type: 'Detached Duplex',
    bedrooms: 5,
    description: "A spacious 5 bedroom fully detached duplex with a Boys' Quarters (BQ), set within a secure, serviced estate.",
    imageUrl: '/images/1.jpeg',
    sortOrder: 1,
  },
  {
    title: '4 Bedroom Semi-Detached With BQ',
    location: 'Lekki Ajah, Lagos',
    price: 240000000,
    currency: 'NGN',
    type: 'Semi-Detached Duplex',
    bedrooms: 4,
    description: "A modern 4 bedroom semi-detached duplex with a Boys' Quarters (BQ), located in a fast-growing Lekki Ajah neighbourhood.",
    imageUrl: '/images/2.jpeg',
    sortOrder: 2,
  },
  {
    title: '3 Bedroom Terrace Duplex',
    location: 'Ajah, near Lagos Business School, Lagos State',
    price: 150000000,
    currency: 'NGN',
    type: 'Terrace Duplex',
    bedrooms: 3,
    description: 'A well-finished 3 bedroom terrace duplex in a gated estate close to the Lagos Business School, Ajah.',
    imageUrl: '/images/3.jpeg',
    sortOrder: 3,
  },
  {
    title: '2 Bedroom Apartment',
    location: 'Lagos Island, Lagos State',
    price: 115000000,
    currency: 'NGN',
    type: 'Apartment',
    bedrooms: 2,
    description: 'A contemporary 2 bedroom apartment on Lagos Island, ideal for urban living and rental income.',
    imageUrl: '/images/4.jpeg',
    sortOrder: 4,
  },
];

async function main() {
  for (const item of properties) {
    const existing = await prisma.realEstateProperty.findFirst({ where: { title: item.title } });
    if (existing) {
      await prisma.realEstateProperty.update({ where: { id: existing.id }, data: item });
      console.log(`Updated: ${item.title}`);
    } else {
      await prisma.realEstateProperty.create({ data: item });
      console.log(`Created: ${item.title}`);
    }
  }

  console.log('--- verify ---');
  const all = await prisma.realEstateProperty.findMany({ orderBy: { sortOrder: 'asc' } });
  for (const p of all) {
    console.log(`${p.sortOrder}. ${p.title} | ${p.currency} ${Number(p.price).toLocaleString()} | ${p.imageUrl} | ${p.status}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
