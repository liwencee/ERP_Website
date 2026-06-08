/**
 * ENDPOINT TESTS
 * Every route: correct status codes, auth guards, redirect behaviour.
 */
import request from 'supertest';
import app from '../server';
import { createTestUser, createTestAdmin, cleanDb, prisma } from './helpers';

const agent = () => request.agent(app);

beforeAll(async () => {
  await cleanDb();
});

afterAll(async () => {
  await cleanDb();
  await prisma.$disconnect();
});

// ─── Protected route redirect ──────────────────────────────────────────────

describe('Auth Guards', () => {
  const protectedRoutes = [
    '/dashboard',
    '/dashboard/investments',
    '/dashboard/wallet',
    '/dashboard/transactions',
    '/dashboard/profile',
    '/dashboard/kyc',
    '/dashboard/notifications',
  ];

  it.each(protectedRoutes)('GET %s redirects to /auth/login when unauthenticated', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  const adminRoutes = [
    '/admin',
    '/admin/users',
    '/admin/plans',
    '/admin/investments',
    '/admin/transactions',
  ];

  it.each(adminRoutes)('GET %s returns 403 when unauthenticated', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(403);
  });
});

// ─── Registration endpoint ─────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('rejects missing required fields', async () => {
    const res = await request(app).post('/auth/register').send({});
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/required|fields/i);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/auth/register').send({
      firstName: 'John', lastName: 'Doe',
      email: 'test@example.com', password: '123',
      confirmPassword: '123',
    });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/8 characters/i);
  });

  it('rejects mismatched passwords', async () => {
    const res = await request(app).post('/auth/register').send({
      firstName: 'John', lastName: 'Doe',
      email: 'test@example.com', password: 'ValidPass1!',
      confirmPassword: 'DifferentPass!',
    });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/do not match/i);
  });

  it('creates new account and redirects', async () => {
    const res = await request(app).post('/auth/register').send({
      firstName: 'Jane', lastName: 'Doe',
      email: `new_${Date.now()}@test.com`,
      password: 'ValidPass1!',
      confirmPassword: 'ValidPass1!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('rejects duplicate email', async () => {
    const { user } = await createTestUser({ email: 'duplicate@test.com' });
    const res = await request(app).post('/auth/register').send({
      firstName: 'Dupe', lastName: 'User',
      email: 'duplicate@test.com',
      password: 'ValidPass1!',
      confirmPassword: 'ValidPass1!',
    });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/already exists/i);
    // cleanup
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── Login endpoint ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('rejects wrong password', async () => {
    const { user } = await createTestUser({ email: 'logintest@test.com' });
    const res = await request(app).post('/auth/login').send({
      email: 'logintest@test.com', password: 'WrongPassword!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects unverified email', async () => {
    const { user } = await createTestUser({ email: 'unverified@test.com', emailVerified: false });
    const res = await request(app).post('/auth/login').send({
      email: 'unverified@test.com', password: 'TestPass123!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('logs in verified investor and redirects to /dashboard', async () => {
    const { user } = await createTestUser({ email: 'investor@test.com' });
    const a = agent();
    const res = await a.post('/auth/login').send({
      email: 'investor@test.com', password: 'TestPass123!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/dashboard');
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('logs in admin and redirects to /admin', async () => {
    const { user } = await createTestAdmin();
    const a = agent();
    const res = await a.post('/auth/login').send({
      email: user.email, password: 'TestPass123!',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/admin');
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── Dashboard endpoints (authenticated) ──────────────────────────────────

describe('Dashboard — Authenticated Access', () => {
  let userEmail: string;
  let userId: string;
  const a = agent();

  beforeAll(async () => {
    const { user } = await createTestUser({ email: 'dashuser@test.com' });
    userEmail = user.email;
    userId = user.id;
    await a.post('/auth/login').send({ email: userEmail, password: 'TestPass123!' });
  });

  afterAll(async () => {
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('GET /dashboard returns 200', async () => {
    const res = await a.get('/dashboard');
    expect(res.status).toBe(200);
  });

  it('GET /dashboard/investments returns 200', async () => {
    const res = await a.get('/dashboard/investments');
    expect(res.status).toBe(200);
  });

  it('GET /dashboard/wallet returns 200', async () => {
    const res = await a.get('/dashboard/wallet');
    expect(res.status).toBe(200);
  });

  it('GET /dashboard/profile returns 200', async () => {
    const res = await a.get('/dashboard/profile');
    expect(res.status).toBe(200);
  });

  it('GET /dashboard/transactions returns 200', async () => {
    const res = await a.get('/dashboard/transactions');
    expect(res.status).toBe(200);
  });

  it('GET /dashboard/notifications returns 200', async () => {
    const res = await a.get('/dashboard/notifications');
    expect(res.status).toBe(200);
  });

  it('GET /dashboard/kyc returns 200', async () => {
    const res = await a.get('/dashboard/kyc');
    expect(res.status).toBe(200);
  });

  it('investor cannot access /admin — gets 403', async () => {
    const res = await a.get('/admin');
    expect(res.status).toBe(403);
  });
});

// ─── Admin endpoints (authenticated as admin) ──────────────────────────────

describe('Admin — Authenticated Access', () => {
  let adminId: string;
  const a = agent();

  beforeAll(async () => {
    const { user } = await createTestAdmin();
    adminId = user.id;
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });
  });

  afterAll(async () => {
    await prisma.wallet.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
  });

  it('GET /admin returns 200', async () => {
    const res = await a.get('/admin');
    expect(res.status).toBe(200);
  });

  it('GET /admin/users returns 200', async () => {
    const res = await a.get('/admin/users');
    expect(res.status).toBe(200);
  });

  it('GET /admin/plans returns 200', async () => {
    const res = await a.get('/admin/plans');
    expect(res.status).toBe(200);
  });

  it('GET /admin/investments returns 200', async () => {
    const res = await a.get('/admin/investments');
    expect(res.status).toBe(200);
  });

  it('GET /admin/transactions returns 200', async () => {
    const res = await a.get('/admin/transactions');
    expect(res.status).toBe(200);
  });

  it('GET /admin/users/create-staff returns 200', async () => {
    const res = await a.get('/admin/users/create-staff');
    expect(res.status).toBe(200);
  });
});
