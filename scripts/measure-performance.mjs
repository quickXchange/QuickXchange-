import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';

// Offline, synthetic measurements only: never reads orders, keys or databases.
const root = resolve(import.meta.dirname, '..');
const results = { builds: {}, selectorSearch: {} };
for (const artifact of ['crypto-exchange-widget', 'quickxchange-telegram-mini-app']) {
  const publicDir = join(root, 'artifacts', artifact, 'dist/public');
  const html = await readFile(join(publicDir, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+\.(?:js|css))["']/g)];
  const files = [...new Set(references.map(match => match[1].split('/assets/')[1]))];
  let bytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const data = await readFile(join(publicDir, 'assets', file));
    bytes += data.length;
    gzipBytes += gzipSync(data).length;
  }
  const jsFiles = (await readdir(join(publicDir, 'assets'))).filter(file => file.endsWith('.js'));
  const entryReferences = [...html.matchAll(/<script\b[^>]*src=["']([^"']*\/assets\/[^"']+\.js)["']/g)];
  let entryJavaScriptBytes = 0;
  let entryJavaScriptGzipBytes = 0;
  for (const match of entryReferences) {
    const data = await readFile(join(publicDir, 'assets', match[1].split('/assets/')[1]));
    entryJavaScriptBytes += data.length;
    entryJavaScriptGzipBytes += gzipSync(data).length;
  }
  results.builds[artifact] = {
    initialFiles: files, initialBytes: bytes, initialGzipBytes: gzipBytes,
    entryJavaScriptBytes, entryJavaScriptGzipBytes, javascriptChunks: jsFiles.length,
  };
}

const temporary = await mkdtemp(join(tmpdir(), 'qx-selector-benchmark-'));
try {
  const cases = [
    ['website', 'artifacts/crypto-exchange-widget/src/components/selector-search.ts'],
    ['miniApp', 'artifacts/quickxchange-telegram-mini-app/src/lib/exchange-search.ts'],
  ];
  const queries = ['', 'usd', 'trc', 'sepa', '999', 'no match'];
  const options = Array.from({ length: 1_000 }, (_, i) => ({
    id: `${i}`, kind: 'crypto-network', title: `Téther ${i}`,
    assetCode: 'USDT', routeNetwork: 'TRC20',
    searchText: `Téther ${i} USDT TRC20`,
  }));
  for (const [name, source] of cases) {
    const output = join(temporary, `${name}.mjs`);
    const bundle = spawnSync(join(root, 'node_modules/.pnpm/node_modules/.bin/esbuild'), [
      join(root, source), '--bundle', '--platform=node', '--format=esm', `--outfile=${output}`,
    ], { encoding: 'utf8' });
    if (bundle.status !== 0) throw new Error(bundle.stderr || 'Benchmark bundling failed.');
    const helpers = await import(pathToFileURL(output).href);
    const index = name === 'website' ? helpers.indexSelectorOptions(options) : helpers.indexExchangeOptions(options);
    const before = query => options.filter(option => name === 'website'
      ? helpers.selectorOptionMatchesQuery(option.searchText, query)
      : helpers.exchangeOptionMatchesSearch(option, query));
    const after = query => {
      if (name === 'miniApp') return helpers.filterIndexedExchangeOptions(index, 'all', query);
      const normalized = helpers.normalizeSelectorSearchValue(query);
      return index.filter(row => row.normalizedSearchText.includes(normalized));
    };
    for (const query of queries) {
      if (before(query).length !== after(query).length) throw new Error('Search matching changed.');
    }
    function measure(fn) {
      for (let i = 0; i < 30; i++) fn(queries[i % queries.length]);
      const samples = [];
      for (let repeat = 0; repeat < 5; repeat++) {
        const start = performance.now();
        for (let i = 0; i < 300; i++) fn(queries[i % queries.length]);
        samples.push(performance.now() - start);
      }
      return Math.round(samples.sort((a, b) => a - b)[2] * 100) / 100;
    }
    results.selectorSearch[name] = {
      syntheticOptions: options.length, searchesPerSample: 300,
      legacyMedianMs: measure(before), indexedMedianMs: measure(after),
      note: 'Warm indexed search; index rebuild occurs only when catalog changes. Local CPU, not network latency.',
    };
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(results, null, 2));
