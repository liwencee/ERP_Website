/**
 * INTEGRATION TESTS
 * Complete user flows: register → login → invest → withdraw → admin confirm
 */
import request from 'supertest';
import app from '../server';
import { createTestUser, createTestAdmin, seedTestPlan, cleanDb, prisma } from './helpers';

const agent = () => request.agent(app);

beforeAll(async () => {
  await cleanDb();
});

afterAll(async () => {
  await cleanDb();
  await prisma.$disconnect();
});

// ─── Registration flow ─────────────────────────────────────────────────────

describe('Registration Flow', () => {
  it('creates user in DB with hashed password and referral code', async () => {
    const email = `reg_${Date.now()}@test.com`;
    await request(app).post('/auth/register').send({
      firstName: 'Chukwu', lastName: 'Emeka',
      email, password: 'SecurePass1!', confirmPassword: 'SecurePass1!',
    });

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.password).not.toBe('SecurePass1!'); // hashed
    expect(user!.password).toMatch(/^\$2[ab]\$/); // bcrypt hash
    expect(user!.referralCode).toBeTruthy();
    expect(user!.role).toBe('INVESTOR');
    expect(user!.emailVerified).toBe(false); // requires verification
  });

  it('creates wallet for new user', async () => {
    const email = `wallet_${Date.now()}@test.com`;
    await request(app).post('/auth/register').send({
      firstName: 'Ada', lastName: 'Obi',
      email, password: 'SecurePass1!', confirmPassword: 'SecurePass1!',
    });

    const user = await prisma.user.findUnique({ where: { email }, include: { wallet: true } });
    expect(user!.wallet).not.toBeNull();
    expect(Number(user!.wallet!.balance)).toBe(0);
  });

  it('referral code links to referrer', async () => {
    const referrer = await createTestUser({ email: 'referrer@test.com' });
    const refCode = referrer.user.referralCode!;

    const newEmail = `referred_${Date.now()}@test.com`;
    await request(app).post('/auth/register').send({
      firstName: 'Nene', lastName: 'Eze',
      email: newEmail, password: 'SecurePass1!', confirmPassword: 'SecurePass1!',
      refCode,
    });

    const newUser = await prisma.user.findUnique({ where: { email: newEmail } });
    expect(newUser!.referredBy).toBe(referrer.user.id);
  });
});

// ─── Login flow ────────────────────────────────────────────────────────────

describe('Login Flow', () => {
  it('investor can login and access dashboard after email verification', async () => {
    const { user } = await createTestUser({ email: 'loginflow@test.com', emailVerified: true });
    const a = agent();

    const loginRes = await a.post('/auth/login').send({
      email: 'loginflow@test.com', password: 'TestPass123!',
    });
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toContain('/dashboard');

    const dashRes = await a.get('/dashboard');
    expect(dashRes.status).toBe(200);
    expect(dashRes.text).toContain(user.firstName);

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('suspended user cannot login', async () => {
    const { user } = await createTestUser({ email: 'suspended@test.com' });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    const res = await request(app).post('/auth/login').send({
      email: 'suspended@test.com', password: 'TestPass123!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('logout clears session', async () => {
    const { user } = await createTestUser({ email: 'logout@test.com' });
    const a = agent();
    await a.post('/auth/login').send({ email: 'logout@test.com', password: 'TestPass123!' });

    const beforeLogout = await a.get('/dashboard');
    expect(beforeLogout.status).toBe(200);

    await a.get('/auth/logout');

    const afterLogout = await a.get('/dashboard');
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.location).toContain('/auth/login');

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── Wallet flow ────────────────────────────────────────────────────────────

describe('Wallet Flow', () => {
  let userId: string;
  let userEmail: string;
  const a = agent();

  beforeAll(async () => {
    const { user } = await createTestUser({ email: 'walletflow@test.com' });
    userId = user.id;
    userEmail = user.email;
    await a.post('/auth/login').send({ email: userEmail, password: 'TestPass123!' });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('POST /dashboard/wallet/fund rejects amounts below ₦100', async () => {
    const res = await a.post('/dashboard/wallet/fund').send({ amount: '50', method: 'BANK_TRANSFER' });
    expect(res.status).toBe(302);
    // should redirect back with error flash
    expect(res.headers.location).toContain('/dashboard/wallet');
  });

  it('POST /dashboard/wallet/fund with bank transfer creates PENDING transaction', async () => {
    const res = await a.post('/dashboard/wallet/fund').send({ amount: '5000', method: 'BANK_TRANSFER' });
    expect(res.status).toBe(302);

    const tx = await prisma.transaction.findFirst({
      where: { userId, type: 'DEPOSIT', status: 'PENDING' },
    });
    expect(tx).not.toBeNull();
    expect(Number(tx!.amount)).toBe(5000);
    expect(tx!.paymentMethod).toBe('BANK_TRANSFER');
  });

  it('POST /dashboard/wallet/withdraw rejects when balance is zero', async () => {
    const res = await a.post('/dashboard/wallet/withdraw').send({ amount: '1000' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/dashboard/wallet');

    // balance still 0
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet!.balance)).toBe(0);
  });

  it('withdrawal succeeds when balance is sufficient', async () => {
    // credit wallet directly
    await prisma.wallet.update({ where: { userId }, data: { balance: 10000 } });

    const res = await a.post('/dashboard/wallet/withdraw').send({ amount: '2000' });
    expect(res.status).toBe(302);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet!.balance)).toBe(8000);
  });
});

// ─── Investment flow ───────────────────────────────────────────────────────

describe('Investment Flow', () => {
  let userId: string;
  let planId: string;
  const a = agent();

  beforeAll(async () => {
    const { user } = await createTestUser({ email: 'investflow@test.com' });
    userId = user.id;
    const plan = await seedTestPlan();
    planId = plan.id;
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });
    // fund wallet so they can invest
    await prisma.wallet.update({ where: { userId }, data: { balance: 50000 } });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.userInvestment.deleteMany({ where: { userId } });
    await prisma.investmentPlan.deleteMany({ where: { id: planId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('GET invest page shows plan details', async () => {
    const res = await a.get(`/dashboard/investments/${planId}/invest`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test Fixed Plan');
  });

  it('POST invest rejects amount below plan minimum', async () => {
    const res = await a.post(`/dashboard/investments/${planId}/invest`).send({ amount: '100' });
    expect(res.status).toBe(302);

    const inv = await prisma.userInvestment.findFirst({ where: { userId } });
    expect(inv).toBeNull(); // no investment created
  });

  it('POST invest creates investment and debits wallet', async () => {
    const res = await a.post(`/dashboard/investments/${planId}/invest`).send({ amount: '20000' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/dashboard/investments');

    const inv = await prisma.userInvestment.findFirst({ where: { userId, planId } });
    expect(inv).not.toBeNull();
    expect(Number(inv!.amount)).toBe(20000);
    expect(inv!.status).toBe('ACTIVE');

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet!.balance)).toBe(30000); // 50000 - 20000
  });

  it('non-SAVINGS investment cannot be redeemed early', async () => {
    const inv = await prisma.userInvestment.findFirst({ where: { userId, planId } });
    const res = await a.post(`/dashboard/investments/${inv!.id}/redeem-early`);
    expect(res.status).toBe(302);
    // wallet should remain unchanged (investment type is FIXED_DEPOSIT)
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet!.balance)).toBe(30000);
  });
});

// ─── Profile flow ──────────────────────────────────────────────────────────

describe('Profile Flow', () => {
  let userId: string;
  const a = agent();

  beforeAll(async () => {
    const { user } = await createTestUser({ email: 'profileflow@test.com' });
    userId = user.id;
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });
  });

  afterAll(async () => {
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('POST /dashboard/profile updates name and phone', async () => {
    const res = await a.post('/dashboard/profile').send({
      firstName: 'Updated', lastName: 'Name', phone: '+2348012345678',
    });
    expect(res.status).toBe(302);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.firstName).toBe('Updated');
    expect(user!.lastName).toBe('Name');
    expect(user!.phone).toBe('+2348012345678');
  });

  it('POST /dashboard/profile/password rejects wrong current password', async () => {
    const res = await a.post('/dashboard/profile/password').send({
      currentPassword: 'WrongPassword!',
      newPassword: 'NewPass123!',
      confirmPassword: 'NewPass123!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/dashboard/profile');
  });
});

// ─── Admin flow ────────────────────────────────────────────────────────────

describe('Admin Flow', () => {
  let adminId: string;
  let targetUserId: string;
  let txId: string;
  const a = agent();

  beforeAll(async () => {
    const { user: admin } = await createTestAdmin();
    adminId = admin.id;
    const { user: target } = await createTestUser({ email: 'admintarget@test.com' });
    targetUserId = target.id;

    // Create a pending deposit transaction
    const tx = await prisma.transaction.create({
      data: {
        userId: targetUserId,
        type: 'DEPOSIT',
        amount: 5000,
        status: 'PENDING',
        reference: `BNK-TEST-${Date.now()}`,
        paymentMethod: 'BANK_TRANSFER',
      },
    });
    txId = tx.id;

    await a.post('/auth/login').send({ email: admin.email, password: 'TestPass123!' });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: targetUserId } });
    await prisma.transaction.deleteMany({ where: { userId: targetUserId } });
    await prisma.wallet.deleteMany({ where: { userId: { in: [adminId, targetUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, targetUserId] } } });
  });

  it('admin can confirm a pending deposit and credit wallet', async () => {
    const res = await a.post(`/admin/transactions/${txId}/confirm`).send({});
    expect(res.status).toBe(302);

    const tx = await prisma.transaction.findUnique({ where: { id: txId } });
    expect(tx!.status).toBe('CONFIRMED');

    const wallet = await prisma.wallet.findUnique({ where: { userId: targetUserId } });
    expect(Number(wallet!.balance)).toBe(5000);
  });

  it('admin can suspend a user', async () => {
    const res = await a.post(`/admin/users/${targetUserId}/status`).send({});
    expect(res.status).toBe(302);

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(user!.status).toBe('SUSPENDED');
  });

  it('admin can create a staff account', async () => {
    const staffEmail = `staff_${Date.now()}@test.com`;
    const res = await a.post('/admin/users/create-staff').send({
      firstName: 'Staff', lastName: 'Member',
      email: staffEmail, password: 'StaffPass1!',
    });
    expect(res.status).toBe(302);

    const staff = await prisma.user.findUnique({ where: { email: staffEmail } });
    expect(staff).not.toBeNull();
    expect(staff!.role).toBe('STAFF');
    expect(staff!.emailVerified).toBe(true);

    await prisma.wallet.deleteMany({ where: { userId: staff!.id } });
    await prisma.user.delete({ where: { id: staff!.id } });
  });

  it('admin can force-logout a user', async () => {
    const before = await prisma.user.findUnique({ where: { id: targetUserId } });
    const versionBefore = before!.sessionVersion;

    await a.post(`/admin/users/${targetUserId}/force-logout`).send({});

    const after = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(after!.sessionVersion).toBe(versionBefore + 1);
  });
});
