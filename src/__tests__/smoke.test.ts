/**
 * SMOKE TESTS
 * Verify the server starts and all public pages render without errors.
 */
import request from 'supertest';
import app from '../server';

describe('Smoke Tests — Public Pages', () => {
  const publicPages = [
    { path: '/', name: 'Home' },
    { path: '/about', name: 'About' },
    { path: '/services', name: 'Services' },
    { path: '/team', name: 'Team' },
    { path: '/compliance', name: 'Compliance' },
    { path: '/contact', name: 'Contact' },
  ];

  it.each(publicPages)('GET $path ($name) returns 200', async ({ path }) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  describe('Auth Pages', () => {
    it('GET /auth/login returns 200', async () => {
      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Login');
    });

    it('GET /auth/register returns 200', async () => {
      const res = await request(app).get('/auth/register');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Create');
    });

    it('GET /auth/forgot-password returns 200', async () => {
      const res = await request(app).get('/auth/forgot-password');
      expect(res.status).toBe(200);
    });
  });

  describe('Error Pages', () => {
    it('GET /nonexistent-page returns 404', async () => {
      const res = await request(app).get('/this-page-does-not-exist');
      expect(res.status).toBe(404);
    });

    it('GET /admin/nonexistent returns 403 (not logged in)', async () => {
      const res = await request(app).get('/admin/xyz');
      expect(res.status).toBe(403);
    });
  });

  describe('Security Headers', () => {
    it('responses include X-Content-Type-Options', async () => {
      const res = await request(app).get('/');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('responses include X-Frame-Options or CSP frame-ancestors', async () => {
      const res = await request(app).get('/');
      const hasXFrame = !!res.headers['x-frame-options'];
      const hasCSP = !!(res.headers['content-security-policy']);
      expect(hasXFrame || hasCSP).toBe(true);
    });

    it('responses do not expose X-Powered-By', async () => {
      const res = await request(app).get('/');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
