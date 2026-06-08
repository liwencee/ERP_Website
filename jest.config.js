/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['./src/__tests__/env.setup.ts'],
  globalSetup: './src/__tests__/global.setup.ts',
  globalTeardown: './src/__tests__/global.teardown.ts',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  testTimeout: 15000,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/__tests__/**',
    '!src/server.ts',
  ],
  coverageReporters: ['text', 'lcov'],
};
