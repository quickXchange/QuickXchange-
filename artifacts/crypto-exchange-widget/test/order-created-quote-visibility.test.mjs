import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [confirmation, adminPreview, feeBreakdown] = await Promise.all([
  readFile(new URL('../src/pages/order-confirmation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin-swap-addon-preview.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-fee-breakdown.tsx', import.meta.url), 'utf8'),
]);

test('Order Created keeps the exchange summary compact without a customer fee breakdown', () => {
  assert.doesNotMatch(confirmation, /SwapFeeBreakdown|persistedFees|Your quote, itemized/);
  assert.match(confirmation, /order-confirmation-exchange-summary/);
  assert.match(confirmation, /order-exchange-summary-meta mt-4/);
  assert.match(confirmation, /Exchange Rate/);
  assert.match(confirmation, /Created Date/);
  assert.match(confirmation, /Order ID/);
});

test('Admin fee preview retains its itemized quote', () => {
  assert.match(adminPreview, /<SwapFeeBreakdown fees=\{current\.feeSnapshot\}/);
  assert.match(feeBreakdown, /Your quote, itemized/);
});