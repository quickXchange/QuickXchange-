import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const widget = await readFile(new URL('../src/components/quickex-convert-widget.tsx', import.meta.url), 'utf8');

test('Convert automatically requotes expired Step 1 quotes once per successful quote cycle', () => {
  assert.match(widget, /const timeout = window\.setTimeout\(\(\) => setQuoteExpired\(true\), remaining \+ 50\)/);
  assert.match(widget, /if \(step !== 1 \|\| !quoteExpired \|\| !quote \|\| Date\.now\(\) < new Date\(quote\.expiresAt\)\.getTime\(\)\) return/);
  assert.match(widget, /if \(guard\?\.requestKey === quote\.requestKey && guard\.attempted\) return/);
  assert.match(widget, /autoRequoteGuardRef\.current = \{ requestKey: quote\.requestKey, attempted: true \}/);
  assert.match(widget, /autoRequoteInFlightKeyRef\.current = quote\.requestKey;\s*setQuoteRefreshKey\(key => key \+ 1\)/);
  assert.match(widget, /attempted: wasAutoRequote && expiresAt <= Date\.now\(\)/);
});

test('Convert Step 2 keeps its explicit expired-quote refresh action', () => {
  assert.match(widget, /data-testid="convert-expired-quote"/);
  assert.match(widget, /onClick=\{\(\) => \{\s*moveToStep\(1\);[\s\S]*?setQuoteRefreshKey\(key => key \+ 1\);\s*\}\}/);
});