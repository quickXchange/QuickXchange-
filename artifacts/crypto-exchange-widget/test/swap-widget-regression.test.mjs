import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [surface, addonOptions, feeBreakdown, styles, followupStyles, adminAddons] = await Promise.all([
  readFile(new URL('../src/components/exchange-surface.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-addon-options.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-fee-breakdown.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/swap-followup.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/admin-swap-addons.tsx', import.meta.url), 'utf8'),
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
  const popupEnd = surface.indexOf('{notice && (', popupStart);
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
  assert.match(surface, /className="swap-summary-rate" data-testid="swap-summary-rate"/);
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
  assert.match(surface, /<details className="swap-addons-dropdown mt-4" data-testid="swap-addons-inline">/);
  assert.match(surface, /<summary data-testid="button-swap-addons-dropdown">/);
  assert.match(surface, /selectedKeys\.length \? `\$\{selectedKeys\.length\} selected` : 'Choose options'/);
  assert.match(styles, /\.swap-addons-dropdown\[open\] > summary svg/);
  assert.doesNotMatch(adminAddons, /Advanced · Exchange fee|summary-exchange-fee-advanced|button-save-exchange-fee/);
});

test('Swap keeps the quote in Step 1, contact details in Step 2, and the compact rate in Summary', () => {
  const stepOneStart = surface.indexOf('className="swap-step-panel swap-quote-step');
  const stepOneEnd = surface.indexOf(') : step === 2', stepOneStart);
  const stepOne = surface.slice(stepOneStart, stepOneEnd);
  const addonsInlineStart = stepOne.indexOf('data-testid="swap-addons-inline"');
  const breakdownStart = stepOne.indexOf('data-testid="swap-signed-fee-breakdown"');
  const continueStart = stepOne.indexOf('data-testid="button-swap-continue"');
  const stepTwoEnd = surface.indexOf(') : step === 3', stepOneEnd);
  const stepTwo = surface.slice(stepOneEnd, stepTwoEnd);
  const stepThreeStart = stepTwoEnd;
  const stepThreeEnd = surface.indexOf(') : (', stepThreeStart);
  const stepThree = surface.slice(stepThreeStart, stepThreeEnd);
  const emailStart = stepTwo.indexOf('data-testid="input-customer-email"');
  const receivingFieldsStart = stepTwo.indexOf('order-detail-field--destination');
  assert.ok(stepOneStart >= 0 && stepOneEnd > stepOneStart);
  assert.ok(stepTwoEnd > stepOneEnd && stepThreeEnd > stepThreeStart);
  assert.ok(addonsInlineStart >= 0 && addonsInlineStart < breakdownStart && breakdownStart < continueStart);
  assert.match(stepOne, /data-testid="input-amount"/);
  assert.match(stepOne, /data-testid="input-receive-amount"/);
  assert.match(stepOne, /data-testid="route-summary"[\s\S]*?reference-rate-value/);
  assert.match(stepOne, /<SwapFeeBreakdown fees=\{currentQuote\.manualSwapFees\} currency=\{toOption\.assetCode\} receiveAmount=\{currentQuote\.receiveAmount\}/);
  assert.match(stepOne, /<SwapAddonOptions options=\{availableAddons\.filter\(item => item\.enabled\)\} selectedKeys=\{selectedKeys\} onToggle=\{toggleAddon\}[\s\S]*?compact/);
  assert.doesNotMatch(stepOne, /swap-addons-disclosure|swap-selected-addons-quote-summary|button-swap-addons(?!-dropdown)/);
  assert.doesNotMatch(stepOne, /input-customer-email|id="swap-email"/);
  assert.ok(emailStart >= 0 && emailStart < receivingFieldsStart);
  assert.match(stepTwo, /type="email"\s+required=\{!signedInCustomer\}\s+disabled=\{Boolean\(signedInCustomer\)\}\s+value=\{signedInCustomer \? user\?\.primaryEmailAddress\?\.emailAddress \?\? '' : email\}\s+onChange=\{\(event\) => setEmail\(event\.target\.value\)\}/);
  assert.match(stepTwo, /data-testid="input-customer-email"[\s\S]*?order-detail-field--destination/);
  assert.equal(surface.match(/data-testid="input-customer-email"/g)?.length, 1);
  assert.match(surface, /className="swap-summary-rate" data-testid="swap-summary-rate"/);
  assert.equal(stepThree.match(/data-testid="swap-summary-rate"/g)?.length, 1);
  assert.doesNotMatch(stepThree, /button-swap-addons|swap-compact-rate|reference-rate-value/);
  assert.match(stepThree, /<div className="swap-summary-footer">\s*<div className="swap-summary-terms"><OrderPolicyAcceptance id="swap-terms" checked=\{termsAccepted\} onChange=\{setTermsAccepted\} \/><\/div>\s*<div className="swap-stage-actions">/);
  assert.doesNotMatch(stepThree, /data-testid="button-swap-addons"/);
  assert.match(surface, /customerEmail: signedInCustomer \? undefined : email\.trim\(\)/);
  assert.doesNotMatch(surface, /addonsPopupOpen|swap-addons-popup/);
  assert.doesNotMatch(surface, /setSelectedAddOnKeys\(\[\]\)/);
  assert.match(surface, /options=\{availableAddons\.filter\(item => item\.enabled\)\}/);
  assert.match(surface, /onToggle=\{toggleAddon\}/);
  assert.match(surface, /data-testid="swap-addons-quote-status"/);
  assert.match(surface, /quoteStatus !== 'loading' && quotePreview\?\.requestKey === quoteRequestKey/);
  assert.match(addonOptions, /aria-label="Optional Swap add-ons"/);
  assert.match(addonOptions, /No add-ons are currently available/);
  assert.match(followupStyles, /\.swap-addon-native-checkbox\s*\{[^}]*position: static;[^}]*opacity: 1;[^}]*accent-color:/s);
  assert.match(styles, /@media \(max-width: 374px\)\s*\{\s*\.public-shell\s*\{\s*--exchange-shell-height: 640px;/);
  assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 903px\)\s*\{\s*\.public-shell\s*\{\s*--exchange-shell-height: 700px;/);
  assert.match(styles, /\.swap-quote-scroll-region\s*\{[^}]*overflow-y: auto;/s);
  assert.match(styles, /> \.swap-quote-step\s*\{[^}]*flex: 1 1 auto !important;[^}]*overflow: hidden !important;/s);
  assert.match(styles, /\.swap-addon-options-list\s*\{[^}]*max-height: 174px;[^}]*overflow-y: auto/s);
});

test('Summary hides fee itemization while preserving quote amounts, rate, and Terms', () => {
  const summary = surface.slice(surface.indexOf('className="swap-step-panel swap-summary-step"'), surface.indexOf('{detailsOpen &&'));
  assert.doesNotMatch(summary, /SwapFeeBreakdown|swap-selected-addons-quote-summary|Your quote, itemized/);
  assert.match(summary, /swap-summary-send-amount/);
  assert.match(summary, /swap-summary-rate/);
  assert.match(summary, /formatSwapRate\(currentQuote\.rate\)/);
  assert.match(summary, /swap-summary-receive-amount/);
  assert.match(summary, /OrderPolicyAcceptance id="swap-terms" checked=\{termsAccepted\} onChange=\{setTermsAccepted\}/);
  assert.doesNotMatch(summary, /data-testid="button-swap-addons"/);
  assert.match(summary, /!currentQuote\.manualSwapFees/);
  assert.match(surface, /swap-fee-breakdown-unavailable/);
  assert.match(surface, /data-testid="swap-receiving-details-popup"/);
  assert.match(surface, /step !== 3\) return/);
  assert.match(feeBreakdown, /Selected add-ons · Add-on fees/);
  assert.match(feeBreakdown, /fees\.selectedAddons\.length/);
  assert.match(feeBreakdown, /No add-ons selected/);
  assert.match(feeBreakdown, /item\.feeType === 'percentage' && item\.percentage != null[\s\S]*?trimFeeDecimal\(item\.percentage\).*?%/);
  assert.match(feeBreakdown, /trimFeeDecimal\(item\.targetAmount\)\} \{currency\}/);
  assert.match(feeBreakdown, /addon\?\.translations\?\.\[locale as 'en' \| 'ru' \| 'ar' \| 'uk'\]/);
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
  const continueToDetailsStart = surface.indexOf('const continueToDetails = () =>');
  const continueToSummaryStart = surface.indexOf('const continueToSummary = () =>', continueToDetailsStart);
  const continueToSummaryEnd = surface.indexOf('const changeFromAsset =', continueToSummaryStart);
  const continueToDetails = surface.slice(continueToDetailsStart, continueToSummaryStart);
  const continueToSummary = surface.slice(continueToSummaryStart, continueToSummaryEnd);
  const submitStart = surface.indexOf('const submitExchange = (event: React.FormEvent) =>');
  const submitEnd = surface.indexOf('const parsedDetails:', submitStart);
  const submitExchange = surface.slice(submitStart, submitEnd);
  assert.ok(continueToDetailsStart >= 0 && continueToSummaryStart > continueToDetailsStart);
  assert.doesNotMatch(continueToDetails, /email|swap-email|reportValidity/);
  assert.match(continueToDetails, /if \(!canContinue\) return;[\s\S]*?moveToStep\(2\)/);
  assert.match(continueToSummary, /querySelectorAll<HTMLInputElement \| HTMLSelectElement \| HTMLTextAreaElement>\('input, select, textarea'\)/);
  assert.match(continueToSummary, /if \(!field\.checkValidity\(\)\) \{[\s\S]*?field\.reportValidity\(\);[\s\S]*?field\.focus\(\);[\s\S]*?return;/);
  assert.match(continueToSummary, /if \(!signedInCustomer && !email\.trim\(\)\)/);
  assert.match(surface, /stepPanelRef\.current\?\.querySelectorAll<[^>]+>\('input, select, textarea'\)/);
  assert.match(surface, /field\.checkValidity\(\)/);
  assert.match(surface, /field\.reportValidity\(\)/);
  assert.match(submitExchange, /if \(step !== 3\) return/);
  assert.match(submitExchange, /if \(!signedInCustomer && !email\.trim\(\)\)/);
  assert.match(submitExchange, /if \(!termsAccepted\)/);
  assert.match(surface, /disabled=\{orderMutation\.isPending \|\| !quoteReady \|\| !currentQuote\.manualSwapFees \|\| !termsAccepted \|\| \(!signedInCustomer && !email\.trim\(\)\)\}/);
  assert.match(surface, /currentQuote\?\.requiredSettlementFields\?\.filter/);
  assert.match(surface, /settlementDetails: Object\.keys\(parsedDetails\)\.length > 0 \? parsedDetails : undefined/);
});