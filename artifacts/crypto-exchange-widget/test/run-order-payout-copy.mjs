import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const widgetDir = resolve(testDir, '..');
const outputDir = await mkdtemp(join(tmpdir(), 'order-payout-copy-'));
const bundled = join(outputDir, 'order-payout-copy.mjs');
try {
  const build = spawnSync(resolve(widgetDir, '../../node_modules/.pnpm/node_modules/.bin/esbuild'), [
    resolve(widgetDir, 'src/components/order-payout-copy.ts'), '--bundle', '--platform=node',
    '--format=esm', `--outfile=${bundled}`,
  ], { stdio: 'inherit' });
  if (build.status !== 0) process.exitCode = build.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', resolve(testDir, 'order-payout-copy.test.mjs')], {
      stdio: 'inherit', env: { ...process.env, ORDER_PAYOUT_COPY_MODULE: pathToFileURL(bundled).href },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
