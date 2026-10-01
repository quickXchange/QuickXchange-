import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const widgetDir = resolve(testDir, '..');
const esbuild = resolve(widgetDir, '../../node_modules/.pnpm/node_modules/.bin/esbuild');
const outputDir = await mkdtemp(join(tmpdir(), 'admin-pagination-'));
const bundledTests = join(outputDir, 'admin-pagination.test.cjs');

try {
  const bundle = spawnSync(esbuild, [
    resolve(testDir, 'admin-list-pagination.test.tsx'),
    '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', '--loader:.css=empty',
    `--outfile=${bundledTests}`,
  ], { stdio: 'inherit' });
  if (bundle.status !== 0) process.exitCode = bundle.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', bundledTests], {
      stdio: 'inherit',
      env: { ...process.env, ADMIN_PAGINATION_WIDGET_DIR: widgetDir },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  await rm(outputDir, { recursive: true, force: true });
}