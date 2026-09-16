import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command:
      'pnpm --filter @workspace/crypto-exchange-widget exec vite --config vite.config.ts --host 127.0.0.1 --mode e2e',
    env: {
      ...process.env,
      PORT: '4173',
      BASE_PATH: '/',
      NODE_ENV: 'test',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});