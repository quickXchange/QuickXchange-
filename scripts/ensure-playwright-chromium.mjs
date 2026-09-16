import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import { chromium } from '@playwright/test';

const executablePath = chromium.executablePath();

try {
  await access(executablePath);
} catch {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'install', 'chromium'],
    { stdio: 'inherit' },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}