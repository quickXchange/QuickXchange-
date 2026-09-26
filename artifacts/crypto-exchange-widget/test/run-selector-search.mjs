import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const widgetDir = resolve(testDir, '..');
const esbuild = resolve(widgetDir, '../../node_modules/.pnpm/node_modules/.bin/esbuild');
const outputDir = await mkdtemp(join(tmpdir(), 'selector-search-'));
const bundledHelper = join(outputDir, 'selector-search.mjs');

try {
  const bundle = spawnSync(esbuild, [
    resolve(widgetDir, 'src/components/selector-search.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${bundledHelper}`,
  ], { stdio: 'inherit' });
  if (bundle.status !== 0) process.exitCode = bundle.status ?? 1;
  else {
    const tests = spawnSync(process.execPath, [
      '--test',
      resolve(testDir, 'selector-search.test.mjs'),
    ], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SELECTOR_SEARCH_MODULE: pathToFileURL(bundledHelper).href,
      },
    });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  await rm(outputDir, { recursive: true, force: true });
}