import { defineConfig } from '@playwright/test';

const liveBaseURL = process.env.MINI_APP_LIVE_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: liveBaseURL || 'http://127.0.0.1:4174',
    headless: true,
  },
  webServer: liveBaseURL ? undefined : {
    command:
      'pnpm --filter @workspace/quickxchange-telegram-mini-app exec vite --config vite.config.ts --host 127.0.0.1 --mode e2e',
    env: {
      ...process.env,
      PORT: '4174',
      BASE_PATH: '/telegram-mini-app/',
      NODE_ENV: 'test',
    },
    url: 'http://127.0.0.1:4174/telegram-mini-app/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});