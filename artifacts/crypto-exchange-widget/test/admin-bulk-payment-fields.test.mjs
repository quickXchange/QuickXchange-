import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('payment method selection persists across pages and filtered selection includes all matching methods', async () => {
  const source = await readFile(new URL('../src/pages/admin.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(tab === 'methods'\) return;\s*setCatalogSelected\(current/);
  assert.match(source, /if \(newTab !== 'methods'\) setCatalogSelected/);
  assert.match(source, /filteredMethods\.forEach\(method => checked \? next\.add\(method\.id\) : next\.delete\(method\.id\)\)/);
  assert.match(source, /methodIds=\{Array\.from\(catalogSelected\.methods\)\}/);
  assert.match(source, /button-select-all-filtered-methods/);
  assert.match(source, /button-deselect-all-filtered-methods/);
  assert.match(source, /button-deselect-all-methods/);
  assert.match(source, /methods=\{methodsQuery\.data \|\| \[\]\}/);
  assert.match(source, /result\.updated\} updated, \$\{result\.skipped\} skipped, \$\{result\.failed\} failed/);
});

test('bulk fields are previewed before one atomic apply and both dependent caches are refreshed', async () => {
  const source = await readFile(new URL('../src/components/admin-payment-method-bulk-fields-dialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /usePreviewBulkPaymentMethodFields\(\)/);
  assert.match(source, /useApplyBulkPaymentMethodFields\(\)/);
  assert.match(source, /previewMutation\.mutateAsync\(\{ data: \{ methodIds: selectedIds, fields, changeExistingDirectionKeys \} \}\)/);
  assert.match(source, /signature = JSON\.stringify\(\{ methodIds: selectedIds, fields, changeExistingDirectionKeys:/);
  assert.match(source, /changeExistingDirectionKeys,\s*expectedUpdatedAtById: Object\.fromEntries/);
  assert.match(source, /input-bulk-field-change-existing-direction-/);
  assert.match(source, /By default, this direction applies only to new fields/);
  assert.match(source, /status-bulk-fields-direction-warning/);
  assert.match(source, /currentReview\.targets\.filter\(target => target\.directionMismatches\.length > 0\)\.length/);
  assert.match(source, /target\.directionMismatches\.map\(key => displayField/);
  assert.match(source, /expectedUpdatedAtById: Object\.fromEntries\(currentReview\.targets\.map/);
  assert.match(source, /reviewToken: currentReview\.reviewToken/);
  assert.match(source, /if \(!value\.reviewToken\) setError\('The server did not provide a review token/);
  assert.match(source, /if \(!currentReview\?\.reviewToken \|\| pending/);
  assert.match(source, /review\?\.signature === signature/);
  assert.match(source, /applyMutation\.mutateAsync\(\{/);
  assert.match(source, /getGetPaymentMethodsQueryKey\(\)/);
  assert.match(source, /getGetExchangeConfigQueryKey\(\)/);
  assert.match(source, /setReview\(null\);\s*setStep\('edit'\);\s*setError\(`[^`]*This review is no longer valid/);
  assert.match(source, /while \(fields\.some\(field => field\.key === key\)\)/);
  assert.match(source, /change\(index, \{ label: event\.target\.value \}\)/);
  assert.match(source, /data-testid=\{`input-bulk-field-key-\$\{index\}`\}/);
  assert.match(source, /fieldDefinitions\?\.find\(field => field\.key === key\)/);
  assert.match(source, /target\.modified\.map\(key => displayField\(target\.id, key, 'modified'\)\)/);
  assert.doesNotMatch(source, /__auto__/);
});