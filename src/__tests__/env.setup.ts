// Runs BEFORE any module is required — sets env vars for test database
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.APP_URL = 'http://localhost:3001';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'test';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_placeholder';
process.env.SQUADCO_SECRET_KEY = 'sandbox_sk_placeholder';
