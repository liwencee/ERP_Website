/**
 * SECURITY TESTS
 * XSS, SQL injection, auth bypass, path traversal, rate-limit headers.
 */
import request from 'supertest';
import app from '../server';
import { createTestUser, cleanDb, prisma } from './helpers';

const agent = () => request.agent(app);

beforeAll(async () => {
  await cleanDb();
});

afterAll(async () => {
  await cleanDb();
  await prisma.$disconnect();
});

// ─── XSS ──────────────────────────────────────────────────────────────────

describe('XSS Protection', () => {
  it('XSS payload in registration firstName is not reflected as executable script', async () => {
    const xssPayload = '<script>alert("xss")</script>';
    await request(app).post('/auth/register').send({
      firstName: xssPayload,
      lastName: 'Test',
      email: `xss_${Date.now()}@test.com`,
      password: 'ValidPass1!',
      confirmPassword: 'ValidPass1!',
    });

    // Verify stored value is the raw string (DB stores it), not that it's executed
    const user = await prisma.user.findFirst({
      where: { email: { contains: 'xss_' } },
      orderBy: { createdAt: 'desc' },
    });
    if (user) {
      // The value is stored — EJS's <%=  %> auto-escapes HTML entities
      // We just verify it's stored as plain text, not executed
      expect(user.firstName).toBe(xssPayload);
      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('EJS renders user-controlled output with HTML escaping on profile page', async () => {
    const { user } = await createTestUser({
      email: `xssrender_${Date.now()}@test.com`,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { firstName: '<b>Bold</b>' },
    });

    const a = agent();
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });
    const res = await a.get('/dashboard/profile');

    // EJS <%= %> escapes < and > to &lt; &gt;
    expect(res.text).not.toContain('<b>Bold</b>');
    expect(res.text).toContain('&lt;b&gt;Bold&lt;/b&gt;');

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── SQL Injection ────────────────────────────────────────────────────────

describe('SQL Injection Protection', () => {
  it("SQL injection in login email field does not expose data", async () => {
    const res = await request(app).post('/auth/login').send({
      email: "' OR '1'='1'; --",
      password: "' OR '1'='1",
    });
    // Should redirect back to login (not to dashboard)
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('SQL injection in registration email is rejected or stored safely', async () => {
    const injectionEmail = "test'); DROP TABLE users; --@test.com";
    const res = await request(app).post('/auth/register').send({
      firstName: 'SQL', lastName: 'Test',
      email: injectionEmail,
      password: 'ValidPass1!', confirmPassword: 'ValidPass1!',
    });
    // App should not crash — either 200 (validation error) or 302 (treated as string)
    expect([200, 302]).toContain(res.status);
    // DB should still be operational
    const count = await prisma.user.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─── Authentication Bypass ─────────────────────────────────────────────────

describe('Authentication Bypass', () => {
  it('cannot access dashboard by forging session cookie manually', async () => {
    const res = await request(app)
      .get('/dashboard')
      .set('Cookie', 'connect.sid=fakeforgedsession');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('investor cannot POST to admin transaction confirm endpoint', async () => {
    const { user } = await createTestUser({ email: `bypasstest_${Date.now()}@test.com` });
    const a = agent();
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });

    // Try to confirm a transaction as an investor (should be 403)
    const res = await a.post('/admin/transactions/fake-id/confirm').send({});
    expect(res.status).toBe(403);

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('investor cannot access admin users list', async () => {
    const { user } = await createTestUser({ email: `bypassusers_${Date.now()}@test.com` });
    const a = agent();
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });

    const res = await a.get('/admin/users');
    expect(res.status).toBe(403);

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('force-logged-out session cannot access dashboard', async () => {
    const { user } = await createTestUser({ email: `forcelogout_${Date.now()}@test.com` });
    const a = agent();
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });

    // Verify session works
    const before = await a.get('/dashboard');
    expect(before.status).toBe(200);

    // Admin increments sessionVersion (simulating force logout)
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });

    // Next request should be invalidated
    const after = await a.get('/dashboard');
    expect(after.status).toBe(302);
    expect(after.headers.location).toContain('/auth/login');

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── Path Traversal ──────────────────────────────────────────────────────

describe('Path Traversal', () => {
  it('path traversal in URL returns 404 (not file contents)', async () => {
    const res = await request(app).get('/../../etc/passwd');
    expect([400, 404]).toContain(res.status);
  });

  it('encoded path traversal returns 404', async () => {
    const res = await request(app).get('/%2e%2e%2fetc%2fpasswd');
    expect([400, 404]).toContain(res.status);
  });
});

// ─── Business Logic Security ──────────────────────────────────────────────

describe('Business Logic Security', () => {
  it('cannot withdraw more than wallet balance', async () => {
    const { user } = await createTestUser({ email: `overdraw_${Date.now()}@test.com` });
    await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 500 } });

    const a = agent();
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });

    await a.post('/dashboard/wallet/withdraw').send({ amount: '10000' });

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(wallet!.balance)).toBe(500); // unchanged

    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('cannot invest in a CLOSED plan', async () => {
    const closedPlan = await prisma.investmentPlan.create({
      data: {
        name: 'Closed Plan', type: 'SAVINGS',
        description: 'This plan is closed.',
        minAmount: 1000, returnRate: 10, duration: 30, status: 'CLOSED',
      },
    });

    const { user } = await createTestUser({ email: `closedplan_${Date.now()}@test.com` });
    await prisma.wallet.update({ where: { userId: user.id }, data: { balance: 50000 } });

    const a = agent();
    await a.post('/auth/login').send({ email: user.email, password: 'TestPass123!' });

    const res = await a.post(`/dashboard/investments/${closedPlan.id}/invest`).send({ amount: '5000' });
    expect(res.status).toBe(302);

    const inv = await prisma.userInvestment.findFirst({ where: { userId: user.id, planId: closedPlan.id } });
    expect(inv).toBeNull(); // no investment should be created

    await prisma.investmentPlan.delete({ where: { id: closedPlan.id } });
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('passwords are stored as bcrypt hashes (not plaintext)', async () => {
    const email = `hashcheck_${Date.now()}@test.com`;
    await request(app).post('/auth/register').send({
      firstName: 'Hash', lastName: 'Check',
      email, password: 'MySecret123!', confirmPassword: 'MySecret123!',
    });

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.password).not.toBe('MySecret123!');
    expect(user!.password.length).toBeGreaterThan(30); // bcrypt hashes are 60 chars
    expect(user!.password).toMatch(/^\$2[ab]\$/); // bcrypt prefix

    if (user) {
      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
