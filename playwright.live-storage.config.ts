import { defineConfig } from '@playwright/test';

const baseURL =
  process.env.LIVE_STORAGE_BASE_URL ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'http://127.0.0.1');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'live-payment-method-logo.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL,
    headless: true,
  },
});