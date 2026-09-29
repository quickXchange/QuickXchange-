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

test('receiving popup shows one method logo and amount without dropping configured details', () => {
  const popupStart = surface.indexOf('data-testid="swap-receiving-details-popup"');
  const popupEnd = surface.indexOf('{addonsPopupOpen &&', popupStart);
  assert.ok(popupStart >= 0 && popupEnd > popupStart);
  const popup = surface.slice(popupStart, popupEnd);
  assert.equal(popup.match(/<SwapRouteRecapIcon option=\{toOption\}/g)?.length, 1);
  assert.match(popup, /data-testid="swap-receiving-method-summary"/);
  assert.match(popup, /number\(currentQuote\.receiveAmount\)\} \{toOption\.assetCode\}/);
  assert.match(popup, /toOption\.title \|\| settlementRouteName\(toOption\)/);
  assert.match(popup, /currentQuote\.requiredSettlementFields\?\.filter/);
  assert.match(popup, /settlementDetails\[field\.key\] && <SwapPopupDetail/);
  assert.match(popup, /destinationAddress/);
  assert.match(popup, /destinationMemo/);
});

test('Summary fits the shared fixed shell with scoped spacing and visible actions', () => {
  assert.match(surface, /className="swap-summary-rate text-xs text-muted-foreground" data-testid="swap-summary-rate"/);
  assert.match(styles, /\.exchange-mode-viewport,\s*#customer-exchange[\s\S]*?height: var\(--exchange-shell-height\) !important;/);
  assert.match(styles, /\.swap-widget-step-3 > \.swap-step-panel\.swap-summary-step\s*\{[^}]*flex: 1 1 auto !important;[^}]*overflow: hidden !important;/s);
  assert.match(styles, /\.swap-widget-step-3 \.swap-summary-scroll\s*\{[^}]*gap: 10px;[^}]*overflow-y: auto !important;/s);
  assert.match(styles, /\.swap-widget-step-3 \.swap-summary-footer \.swap-stage-actions\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.8fr\)/s);
  assert.match(styles, /\.swap-widget-step-3 \.swap-summary-footer \.widget-primary-submit:disabled\s*\{[^}]*opacity: 1;/s);
  assert.match(styles, /\.swap-widget-step-3 \.swap-summary-terms > \.order-terms\.policy-acceptance\s*\{[^}]*align-items: center !important;[^}]*margin: 0 !important;/s);
  assert.match(styles, /\.swap-widget-step-3 \.swap-summary-terms \.policy-acceptance input\[type="checkbox"\]\s*\{[^}]*align-self: center;/s);
});

test('optional add-ons show selectable checked state and display-only information without a paid toggle', () => {
  assert.match(addonOptions, /checked=\{selected\} onChange=\{\(\) => onToggle\(item\.key\)\}/);
  assert.match(addonOptions, /data-selected=\{selected\}/);
  assert.match(addonOptions, /item\.selectionRule === 'none'/);
  assert.match(addonOptions, /Information only/);
  assert.match(addonOptions, /Informational only; not selectable and not charged/);
  assert.match(addonOptions, /trimFeeDecimal\(item\.fixedAmount\)/);
});

test('Step 1 docks required contact email and Continue while Add-ons remain available on Summary', () => {
  const stepOneStart = surface.indexOf('className="swap-step-panel swap-quote-step');
  const stepOneEnd = surface.indexOf(') : step === 2', stepOneStart);
  const stepOne = surface.slice(stepOneStart, stepOneEnd);
  const scrollRegionEnd = stepOne.indexOf('\n              </div>\n\n              <div className="swap-quote-options-dock"');
  const dockStart = stepOne.indexOf('data-testid="swap-contact-email-dock"');
  const emailStart = stepOne.indexOf('data-testid="input-customer-email"');
  const continueStart = stepOne.indexOf('data-testid="button-swap-continue"');
  const stepTwo = surface.slice(stepOneEnd, surface.indexOf(') : step === 3', stepOneEnd));
  assert.ok(stepOneStart >= 0 && stepOneEnd > stepOneStart);
  assert.ok(scrollRegionEnd >= 0);
  assert.ok(scrollRegionEnd < dockStart && dockStart < emailStart && emailStart < continueStart);
  assert.match(stepOne, /Your Contact Email/);
  assert.match(stepOne, /type="email"[\s\S]*?required=\{!signedInCustomer\}[\s\S]*?value=\{signedInCustomer \? user\?\.primaryEmailAddress\?\.emailAddress \?\? '' : email\}/);
  assert.doesNotMatch(stepOne, /SwapFeeBreakdown|checkbox-swap-addons|swap-addons-disclosure|swap-selected-addons-quote-summary/);
  assert.doesNotMatch(stepTwo, /input-customer-email|id="swap-email"/);
  assert.equal(surface.match(/data-testid="input-customer-email"/g)?.length, 1);
  assert.match(surface, /const emailField = stepPanelRef\.current\?\.querySelector<HTMLInputElement>\('#swap-email'\)/);
  assert.match(surface, /emailField\.reportValidity\(\)/);
  assert.match(surface, /customerEmail: signedInCustomer \? undefined : email\.trim\(\)/);
  assert.match(surface, /\{addonsPopupOpen && \(\s*<div className="swap-overlay"/);
  assert.match(surface, /data-testid="button-swap-addons"/);
  assert.match(surface, /if \(!open\) \{\s*setSelectedAddOnKeys\(\[\]\);\s*if \(selectedKeys\.length > 0\) \{\s*setTermsAccepted\(false\);\s*setQuotePreview\(null\)/);
  assert.match(surface, /options=\{availableAddons\.filter\(item => item\.enabled\)\}/);
  assert.match(surface, /onToggle=\{toggleAddon\}/);
  assert.match(surface, /data-testid="button-apply-swap-addons"/);
  assert.match(surface, /data-testid="button-close-swap-addons"/);
  assert.match(surface, /quoteStatus !== 'loading' && quotePreview\?\.requestKey === quoteRequestKey/);
  assert.match(addonOptions, /aria-label=\{compact \? 'Additional Options'/);
  assert.match(addonOptions, /No add-ons are currently available/);
  assert.match(styles, /@media \(max-width: 374px\)\s*\{\s*\.public-shell\s*\{\s*--exchange-shell-height: 640px;/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 903px\)\s*\{\s*\.public-shell\s*\{\s*--exchange-shell-height: 700px;/);
  assert.match(styles, /\.swap-quote-scroll-region\s*\{[^}]*overflow-y: auto;/s);
  assert.match(styles, /> \.swap-quote-step\s*\{[^}]*flex: 1 1 auto !important;[^}]*overflow: hidden !important;/s);
  assert.match(styles, /\.swap-addon-options-list\s*\{[^}]*max-height: 174px;[^}]*overflow-y: auto/s);
  assert.match(styles, /\.swap-quote-options-dock\s*\{[^}]*flex: 0 0 auto/s);
});

test('Summary hides fee itemization while preserving quote amounts, rate, Terms, and Add-ons', () => {
  const summary = surface.slice(surface.indexOf('className="swap-step-panel swap-summary-step"'), surface.indexOf('{detailsOpen &&'));
  assert.doesNotMatch(summary, /SwapFeeBreakdown|swap-selected-addons-quote-summary|Your quote, itemized/);
  assert.match(summary, /swap-summary-send-amount/);
  assert.match(summary, /swap-summary-rate/);
  assert.match(summary, /formatSwapRate\(currentQuote\.rate\)/);
  assert.match(summary, /swap-summary-receive-amount/);
  assert.match(summary, /OrderPolicyAcceptance id="swap-terms" checked=\{termsAccepted\} onChange=\{setTermsAccepted\}/);
  assert.match(summary, /data-testid="button-swap-addons"/);
  assert.match(summary, /!currentQuote\.manualSwapFees/);
  assert.match(surface, /swap-fee-breakdown-unavailable/);
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