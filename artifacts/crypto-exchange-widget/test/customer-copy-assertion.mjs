import assert from 'node:assert/strict';
import { customerTranslations } from '../../../lib/i18n/src/customer.ts';

// Legacy source-contract checks must recognize the existing shared dictionary,
// not require English strings to be hardcoded back into multilingual components.
export function assertCustomerCopy(source, phrase) {
  const keys = Object.entries(customerTranslations.en)
    .filter(([, value]) => value.includes(phrase))
    .map(([key]) => `customer.${key}`);
  assert.ok(source.includes(phrase) || keys.some(key =>
    source.includes(`uiT("${key}"`) || source.includes(`uiT('${key}'`)),
  `Expected customer copy "${phrase}" through the shared translation dictionary`);
}
