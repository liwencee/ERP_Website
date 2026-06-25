import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { upsertTestAccounts } from './test-accounts';

const prisma = new PrismaClient();

async function main() {
  // Investment plans
  // Investment structure from EPR Access Limited official rate tables.
  // Each tier offers multiple tenures (6 months / 9 months / 1 year & above),
  // each with its own total return rate. The plan-level returnRate/duration
  // is the headline (1-year) value used for display and as a fallback.
  // Build standard tenures: 6m, 9m, 1yr, 2yr, 3yr, 4yr, 5yr
  // Rates for 2–5 years extrapolated proportionally from 1-year rate.
  const tenures = (
    six: number, nine: number, year: number, ref: number,
    sixDays = 180, nineDays = 270, yearDays = 365,
    sixLabel = '6 Months', nineLabel = '9 Months', yearLabel = '1 Year'
  ) => [
    { label: sixLabel,    durationDays: sixDays,  returnRate: six,             referralRate: ref, sortOrder: 1 },
    { label: nineLabel,   durationDays: nineDays, returnRate: nine,            referralRate: ref, sortOrder: 2 },
    { label: yearLabel,   durationDays: yearDays, returnRate: year,            referralRate: ref, sortOrder: 3 },
    { label: '2 Years',   durationDays: 730,      returnRate: +(year * 2).toFixed(1),  referralRate: ref, sortOrder: 4 },
    { label: '3 Years',   durationDays: 1095,     returnRate: +(year * 3).toFixed(1),  referralRate: ref, sortOrder: 5 },
    { label: '4 Years',   durationDays: 1460,     returnRate: +(year * 4).toFixed(1),  referralRate: ref, sortOrder: 6 },
    { label: '5 Years',   durationDays: 1825,     returnRate: +(year * 5).toFixed(1),  referralRate: ref, sortOrder: 7 },
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
      minAmount:  15000001,
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
      tenures: [
        { label: '30–180 Days',  durationDays: 180,  returnRate: 8,    referralRate: 2, sortOrder: 1 },
        { label: '270 Days',     durationDays: 270,  returnRate: 11.5, referralRate: 2, sortOrder: 2 },
        { label: '1 Year',       durationDays: 360,  returnRate: 14.5, referralRate: 2, sortOrder: 3 },
        { label: '2 Years',      durationDays: 720,  returnRate: 29,   referralRate: 2, sortOrder: 4 },
        { label: '3 Years',      durationDays: 1080, returnRate: 43.5, referralRate: 2, sortOrder: 5 },
        { label: '4 Years',      durationDays: 1440, returnRate: 58,   referralRate: 2, sortOrder: 6 },
        { label: '5 Years',      durationDays: 1800, returnRate: 72.5, referralRate: 2, sortOrder: 7 },
      ],
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
        { label: '6 Months', durationDays: 180,  returnRate: 30,  referralRate: 2.5, sortOrder: 1 },
        { label: '9 Months', durationDays: 270,  returnRate: 45,  referralRate: 2.5, sortOrder: 2 },
        { label: '1 Year',   durationDays: 365,  returnRate: 60,  referralRate: 2.5, sortOrder: 3 },
        { label: '2 Years',  durationDays: 730,  returnRate: 120, referralRate: 2.5, sortOrder: 4 },
        { label: '3 Years',  durationDays: 1095, returnRate: 180, referralRate: 2.5, sortOrder: 5 },
        { label: '4 Years',  durationDays: 1460, returnRate: 240, referralRate: 2.5, sortOrder: 6 },
        { label: '5 Years',  durationDays: 1825, returnRate: 300, referralRate: 2.5, sortOrder: 7 },
      ],
    },
    // ── Dollar Investment ────────────────────────────────────────────────────
    {
      name: 'Dollar Investment – Foreign Currency',
      type: 'DOLLAR' as const,
      description: 'Place capital in USD-denominated assets to protect against naira devaluation and generate returns in a stable currency. Options include US dollar money market funds, Eurobonds, offshore equities and USD-denominated fixed income instruments. Provides currency hedge, stability and access to global markets. Minimum: $50.',
      minAmount: 50,   // $50 — Dollar plan amounts are entered in USD, converted to NGN at invest time
      maxAmount: null,
      returnRate: 5,
      duration: 365,
      tenures: [
        { label: '6 Months', durationDays: 180,  returnRate: 2.5,  referralRate: 2, sortOrder: 1 },
        { label: '9 Months', durationDays: 270,  returnRate: 3.75, referralRate: 2, sortOrder: 2 },
        { label: '1 Year',   durationDays: 365,  returnRate: 5,    referralRate: 2, sortOrder: 3 },
        { label: '2 Years',  durationDays: 730,  returnRate: 10, referralRate: 2, sortOrder: 4 },
        { label: '3 Years',  durationDays: 1095, returnRate: 15, referralRate: 2, sortOrder: 5 },
        { label: '4 Years',  durationDays: 1460, returnRate: 20, referralRate: 2, sortOrder: 6 },
        { label: '5 Years',  durationDays: 1825, returnRate: 25, referralRate: 2, sortOrder: 7 },
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
        { label: '1 Year',  durationDays: 365,  returnRate: 18, referralRate: 1, sortOrder: 1 },
        { label: '2 Years', durationDays: 730,  returnRate: 36, referralRate: 1, sortOrder: 2 },
        { label: '3 Years', durationDays: 1095, returnRate: 54, referralRate: 1, sortOrder: 3 },
        { label: '4 Years', durationDays: 1460, returnRate: 72, referralRate: 1, sortOrder: 4 },
        { label: '5 Years', durationDays: 1825, returnRate: 90, referralRate: 1, sortOrder: 5 },
      ],
    },
  ];

  // Seed plans ONLY on a fresh database. Never delete/recreate when plans
  // already exist — that would cascade-delete live user investments. To change
  // plan rates/bounds on a live DB, use a targeted update script instead.
  const existingPlans = await prisma.investmentPlan.count();
  if (existingPlans === 0) {
    for (const plan of plans) {
      const { tenures: planTenures, ...planData } = plan;
      const created = await prisma.investmentPlan.create({
        data: { ...planData, tenures: { create: planTenures } },
      });
      console.log(`Plan created: ${created.name} (${planTenures.length} tenures)`);
    }
  } else {
    console.log(`Skipping plan seed — ${existingPlans} plans already exist (protecting live data).`);
  }

  // Real Estate Properties
  const properties = [
    {
      title: '5-Bedroom Luxury Duplex',
      location: 'Lekki Phase 1, Lagos',
      price: 250000000,
      currency: 'NGN',
      type: 'Duplex',
      bedrooms: 5,
      bathrooms: 5,
      areaSqm: 450,
      description: 'Exquisite 5-bedroom duplex with modern finishes, BQ, 3 en-suite rooms, fitted kitchen, and 24/7 power. Gated estate with ample parking.',
      imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
      status: 'AVAILABLE',
      featured: true,
      sortOrder: 1,
    },
    {
      title: '4-Bedroom Terrace House',
      location: 'Ikeja GRA, Lagos',
      price: 120000000,
      currency: 'NGN',
      type: 'Terrace',
      bedrooms: 4,
      bathrooms: 4,
      areaSqm: 300,
      description: 'Beautifully finished 4-bedroom terrace in Ikeja GRA with boys quarter, fitted kitchen, and secure estate compound. Close to major landmarks.',
      imageUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80',
      status: 'AVAILABLE',
      featured: true,
      sortOrder: 2,
    },
    {
      title: '3-Bedroom Bungalow',
      location: 'Abuja, FCT',
      price: 85000000,
      currency: 'NGN',
      type: 'Bungalow',
      bedrooms: 3,
      bathrooms: 3,
      areaSqm: 220,
      description: 'Modern 3-bedroom bungalow in a serene Abuja neighbourhood with solar power backup, security post, and landscaped compound.',
      imageUrl: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80',
      status: 'AVAILABLE',
      featured: false,
      sortOrder: 3,
    },
    {
      title: '2-Bedroom Apartment',
      location: 'Victoria Island, Lagos',
      price: 65000000,
      currency: 'NGN',
      type: 'Apartment',
      bedrooms: 2,
      bathrooms: 2,
      areaSqm: 130,
      description: 'Contemporary 2-bedroom apartment on the 8th floor with ocean views, central AC, fitted kitchen, and serviced building. Perfect for professionals.',
      imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
      status: 'AVAILABLE',
      featured: false,
      sortOrder: 4,
    },
    {
      title: '6-Bedroom Mansion',
      location: 'Banana Island, Lagos',
      price: 750000000,
      currency: 'NGN',
      type: 'Mansion',
      bedrooms: 6,
      bathrooms: 7,
      areaSqm: 800,
      description: 'Ultra-luxury 6-bedroom mansion on Banana Island with swimming pool, home theatre, generator house, staff quarters, and premium security.',
      imageUrl: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80',
      status: 'AVAILABLE',
      featured: true,
      sortOrder: 5,
    },
    {
      title: 'Commercial Plaza (6 Shops)',
      location: 'Surulere, Lagos',
      price: 180000000,
      currency: 'NGN',
      type: 'Commercial',
      bedrooms: null,
      bathrooms: null,
      areaSqm: 500,
      description: 'Newly built commercial plaza with 6 large shops, toilets, and security. Excellent for retail or office use in a high-traffic area.',
      imageUrl: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80',
      status: 'AVAILABLE',
      featured: false,
      sortOrder: 6,
    },
  ];
  const existingProps = await prisma.realEstateProperty.count();
  if (existingProps === 0) {
    for (const prop of properties) {
      await prisma.realEstateProperty.create({ data: prop });
      console.log(`Property created: ${prop.title}`);
    }
  } else {
    console.log(`Skipping property seed — ${existingProps} already exist.`);
  }

  // Production admin — created only from environment variables. No password is
  // ever hardcoded; set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const adminHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: { password: adminHash, role: 'ADMIN', status: 'ACTIVE', emailVerified: true },
      create: {
        email: adminEmail.toLowerCase(),
        password: adminHash,
        firstName: 'EPR',
        lastName: 'Administrator',
        role: 'ADMIN',
        emailVerified: true,
        kycStatus: 'APPROVED',
        referralCode: 'EPRADMIN',
        wallet: { create: { balance: 0 } },
      },
    });
    console.log('Admin ready:', admin.email);
  } else {
    console.log('No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping admin creation.');
  }

  // Demo / test accounts — created ONLY when explicitly opted in. Never runs in
  // production. For local dev: set SEED_DEMO=true.
  if (process.env.SEED_DEMO === 'true') {
    console.log('\nSEED_DEMO=true → creating demo/test accounts...');
    await upsertTestAccounts(prisma);
  } else {
    console.log('Skipping demo/test accounts (set SEED_DEMO=true in local dev only).');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
