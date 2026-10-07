import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const widgetDir = resolve(testDir, '..');
const esbuild = resolve(widgetDir, '../../node_modules/.pnpm/node_modules/.bin/esbuild');
const directory = await mkdtemp(join(tmpdir(), 'social-logo-fit-'));
const outfile = join(directory, 'social-logo-fit.mjs');
try {
  const bundled = spawnSync(esbuild, [
    resolve(widgetDir, 'src/components/social-logo-fit.ts'),
    '--bundle', '--platform=node', '--format=esm', `--outfile=${outfile}`,
  ], { stdio: 'inherit' });
  if (bundled.status !== 0) process.exitCode = bundled.status ?? 1;
  else {
    const tested = spawnSync(process.execPath, ['--test', resolve(testDir, 'social-logo-fit.test.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, SOCIAL_LOGO_FIT_MODULE: pathToFileURL(outfile).href },
    });
    process.exitCode = tested.status ?? 1;
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
