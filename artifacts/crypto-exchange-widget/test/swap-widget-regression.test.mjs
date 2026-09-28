import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [surface, addonOptions, feeBreakdown, styles] = await Promise.all([
  readFile(new URL('../src/components/exchange-surface.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-addon-options.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-fee-breakdown.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

test('Swap step two has a visible back action and accurate two-step progress', () => {
  assert.match(surface, /aria-label="Step 2 of 2"[\s\S]*?<span>Step 2 of 2<\/span>/);
  assert.match(surface, /data-testid="swap-button-back"[\s\S]*?<span>← Back<\/span>/);
  assert.match(surface, /onClick=\{\(\) => moveToStep\(1\)\}[\s\S]*?data-testid="swap-button-back"/);
  const backStart = surface.lastIndexOf('<button', surface.indexOf('data-testid="swap-button-back"'));
  const backEnd = surface.indexOf('</button>', backStart);
  assert.doesNotMatch(surface.slice(backStart, backEnd), /ChevronLeft/);
  assert.match(styles, /\.swap-step2-progress-track\s*\{[^}]*grid-template-columns: repeat\(2, 1fr\)/);
});

test('optional add-ons show selectable checked state and display-only information without a paid toggle', () => {
  assert.match(addonOptions, /checked=\{selected\} onChange=\{\(\) => onToggle\(item\.key\)\}/);
  assert.match(addonOptions, /data-selected=\{selected\}/);
  assert.match(addonOptions, /item\.selectionRule === 'none'/);
  assert.match(addonOptions, /Information only/);
  assert.match(addonOptions, /Informational only; not selectable and not charged/);
  assert.match(addonOptions, /trimFeeDecimal\(item\.fixedAmount\)/);
});

test('Step 1 docks compact Additional Options between scrollable quote details and Continue', () => {
  const stepOneStart = surface.indexOf('className="swap-step-panel swap-quote-step');
  const stepOneEnd = surface.indexOf(') : step === 2', stepOneStart);
  const stepOne = surface.slice(stepOneStart, stepOneEnd);
  const scrollRegionEnd = stepOne.indexOf('\n              </div>\n\n              <div className="swap-quote-options-dock"');
  const dockStart = stepOne.indexOf('data-testid="swap-additional-options-dock"');
  const continueStart = stepOne.indexOf('data-testid="button-swap-continue"');
  assert.ok(stepOneStart >= 0 && stepOneEnd > stepOneStart);
  assert.ok(scrollRegionEnd >= 0);
  assert.ok(scrollRegionEnd < dockStart && dockStart < continueStart);
  assert.match(stepOne, /options=\{availableAddons\.filter\(item => item\.enabled\)\}/);
  assert.match(stepOne, /compact\s*\/>/);
  assert.match(stepOne, /selectedKeys\.length > 0/);
  assert.match(stepOne, /quoteStatus === 'idle' && currentQuote/);
  assert.match(stepOne, /currentQuote\.manualSwapFees\.totalFees/);
  assert.match(surface, /quoteStatus !== 'loading' && quotePreview\?\.requestKey === quoteRequestKey/);
  assert.match(addonOptions, /aria-label=\{compact \? 'Additional Options'/);
  assert.match(addonOptions, /No add-ons are currently available/);
  assert.match(styles, /\.swap-quote-scroll-region\s*\{[^}]*overflow-y: auto/s);
  assert.match(styles, /\.swap-addon-options-list\s*\{[^}]*max-height: 174px;[^}]*overflow-y: auto/s);
  assert.match(styles, /\.swap-quote-options-dock\s*\{[^}]*flex: 0 0 auto/s);
});

test('step two itemizes only the server fee snapshot and shows quote send, rate, and receive values', () => {
  assert.match(surface, /<SwapFeeBreakdown fees=\{currentQuote\.manualSwapFees\} currency=\{toOption\.assetCode\} receiveAmount=\{currentQuote\.receiveAmount\}\/>/);
  assert.match(surface, /swap-summary-send-amount/);
  assert.match(surface, /swap-summary-rate/);
  assert.match(surface, /formatSwapRate\(currentQuote\.rate\)/);
  assert.match(surface, /swap-summary-receive-amount/);
  assert.match(surface, /swap-fee-breakdown-unavailable/);
  assert.match(surface, /!currentQuote\.manualSwapFees/);
  assert.match(feeBreakdown, /Selected add-ons · Add-on fees/);
  assert.match(feeBreakdown, /fees\.selectedAddons\.length/);
  assert.match(feeBreakdown, /No add-ons selected/);
});

test('back and stale-configuration recovery preserve user-entered fields and never create an order', () => {
  const backStart = surface.indexOf('data-testid="swap-button-back"');
  const backButtonStart = surface.lastIndexOf('<button', backStart);
  const back = surface.slice(backButtonStart, surface.indexOf('</button>', backStart));
  assert.match(back, /onClick=\{\(\) => moveToStep\(1\)\}/);

  const recoveryStart = surface.indexOf("parsedError?.code === 'MANUAL_QUOTE_CONFIGURATION_CHANGED'");
  const recoveryEnd = surface.indexOf("} else if (parsedError?.outcomeUnknown", recoveryStart);
  const recovery = surface.slice(recoveryStart, recoveryEnd);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart);
  assert.match(recovery, /setStep\(1\)/);
  assert.match(recovery, /errorStatus === 409\) setClientRequestId\(crypto\.randomUUID\(\)\)/);
  assert.match(recovery, /await addons\.refetch\(\)/);
  assert.match(recovery, /setSelectedAddOnKeys\(previous => previous\.filter/);
  assert.match(recovery, /setQuoteRefreshCounter/);
  assert.doesNotMatch(recovery, /orderMutation\.mutate/);
  assert.doesNotMatch(recovery, /set(?:Amount|FromId|ToId|Email|Name|Note|SettlementDetails|DestinationAddress|RefundAddress|DestinationMemo|RefundMemo)\(/);
});