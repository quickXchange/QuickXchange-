import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [surface, addonOptions, feeBreakdown, styles, followupStyles] = await Promise.all([
  readFile(new URL('../src/components/exchange-surface.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-addon-options.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-fee-breakdown.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-followup.css', import.meta.url), 'utf8'),
]);

test('Swap exposes three stages and a details-step back action', () => {
  assert.match(surface, /aria-label=\{`Step \$\{step\} of 3`\}/);
  assert.match(surface, /step === 2 \? <>Receiving <span>Details<\/span><\/> : <span>Summary<\/span>/);
  assert.match(surface, /onClick=\{\(\) => moveToStep\(1\)\}[\s\S]*?data-testid="swap-button-back"/);
  assert.match(surface, /data-testid="button-swap-next"/);
  assert.match(surface, /data-testid="swap-summary-step"/);
  assert.match(surface, /data-testid="button-swap-back"/);
  assert.match(surface, /className="reference-realtime-badge"/);
  assert.match(surface, /Swap <span>Currencies<\/span>/);
  assert.match(followupStyles, /\.swap-step2-progress-track\s*\{/);
  assert.doesNotMatch(followupStyles, /reference-(?:amount-panel|title-row|swap-button)|widget-tabs-pill|form\.exchange-card\.redesigned-widget/);
});

test('optional add-ons show selectable checked state and display-only information without a paid toggle', () => {
  assert.match(addonOptions, /checked=\{selected\} onChange=\{\(\) => onToggle\(item\.key\)\}/);
  assert.match(addonOptions, /data-selected=\{selected\}/);
  assert.match(addonOptions, /item\.selectionRule === 'none'/);
  assert.match(addonOptions, /Information only/);
  assert.match(addonOptions, /Informational only; not selectable and not charged/);
  assert.match(addonOptions, /trimFeeDecimal\(item\.fixedAmount\)/);
});

test('Step 1 docks Add-ons and Continue while Admin choices live in the popup', () => {
  const stepOneStart = surface.indexOf('className="swap-step-panel swap-quote-step');
  const stepOneEnd = surface.indexOf(') : step === 2', stepOneStart);
  const stepOne = surface.slice(stepOneStart, stepOneEnd);
  const scrollRegionEnd = stepOne.indexOf('\n              </div>\n\n              <div className="swap-quote-options-dock"');
  const dockStart = stepOne.indexOf('data-testid="swap-additional-options-dock"');
  const continueStart = stepOne.indexOf('data-testid="button-swap-continue"');
  assert.ok(stepOneStart >= 0 && stepOneEnd > stepOneStart);
  assert.ok(scrollRegionEnd >= 0);
  assert.ok(scrollRegionEnd < dockStart && dockStart < continueStart);
  assert.match(stepOne, /data-testid="checkbox-swap-addons"/);
  assert.match(stepOne, /checked=\{addonsOpen\}/);
  assert.match(stepOne, /onChange=\{event => changeAddonsOpen\(event\.target\.checked\)\}/);
  assert.match(surface, /\{addonsPopupOpen && \(\s*<div className="swap-overlay"/);
  assert.match(surface, /if \(!open\) \{\s*setSelectedAddOnKeys\(\[\]\);\s*if \(selectedKeys\.length > 0\) \{\s*setTermsAccepted\(false\);\s*setQuotePreview\(null\)/);
  assert.match(surface, /options=\{availableAddons\.filter\(item => item\.enabled\)\}/);
  assert.match(surface, /onToggle=\{toggleAddon\}/);
  assert.match(surface, /data-testid="button-apply-swap-addons"/);
  assert.match(surface, /data-testid="button-close-swap-addons"/);
  assert.match(stepOne, /selectedKeys\.length > 0/);
  assert.match(stepOne, /quoteStatus === 'idle' && currentQuote/);
  assert.match(stepOne, /currentQuote\.manualSwapFees\.totalFees/);
  assert.match(surface, /quoteStatus !== 'loading' && quotePreview\?\.requestKey === quoteRequestKey/);
  assert.match(addonOptions, /aria-label=\{compact \? 'Additional Options'/);
  assert.match(addonOptions, /No add-ons are currently available/);
  assert.match(styles, /\.swap-quote-scroll-region\s*\{[^}]*overflow-y: auto/s);
  assert.match(styles, /\.swap-addon-options-list\s*\{[^}]*max-height: 174px;[^}]*overflow-y: auto/s);
  assert.match(styles, /\.swap-quote-options-dock\s*\{[^}]*flex: 0 0 auto/s);
  assert.match(styles, /\.swap-addons-disclosure\s*\{[^}]*min-height: 42px/s);
});

test('summary itemizes only server fees and shows quote send, rate, and receive values', () => {
  assert.match(surface, /<SwapFeeBreakdown fees=\{currentQuote\.manualSwapFees\} currency=\{toOption\.assetCode\} receiveAmount=\{currentQuote\.receiveAmount\}\/>/);
  assert.match(surface, /swap-summary-send-amount/);
  assert.match(surface, /swap-summary-rate/);
  assert.match(surface, /formatSwapRate\(currentQuote\.rate\)/);
  assert.match(surface, /swap-summary-receive-amount/);
  assert.match(surface, /swap-fee-breakdown-unavailable/);
  assert.match(surface, /!currentQuote\.manualSwapFees/);
  assert.match(surface, /data-testid="swap-receiving-details-popup"/);
  assert.match(surface, /step !== 3\) return/);
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

test('dynamic settlement fields are validated before Summary and preserved for submission', () => {
  assert.match(surface, /stepPanelRef\.current\?\.querySelectorAll<[^>]+>\('input, select, textarea'\)/);
  assert.match(surface, /field\.checkValidity\(\)/);
  assert.match(surface, /field\.reportValidity\(\)/);
  assert.match(surface, /currentQuote\?\.requiredSettlementFields\?\.filter/);
  assert.match(surface, /settlementDetails: Object\.keys\(parsedDetails\)\.length > 0 \? parsedDetails : undefined/);
});