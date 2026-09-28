import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [page, modal] = await Promise.all([
  readFile(new URL('../src/pages/order-confirmation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/deposit-details-modal.tsx', import.meta.url), 'utf8'),
]);

test('Swap deposit details open over the existing page using only frozen order values', () => {
  assert.match(page, /order\.depositAddress && \(\s*isQuickex \? \(/);
  assert.match(page, /onClick=\{\(\) => setDepositOpen\(true\)\}/);
  assert.match(page, /\{!isQuickex && order\.depositAddress && \(\s*<DepositDetailsModal/);
  assert.match(page, /<DepositDetailsModal[\s\S]*?amount=\{String\(order\.amount\)\}[\s\S]*?asset=\{order\.fromAsset\}[\s\S]*?network=\{order\.fromNetwork\}[\s\S]*?address=\{order\.depositAddress\}[\s\S]*?memo=\{order\.depositMemo\}[\s\S]*?orderId=\{order\.id\}/);
  assert.match(page, /addressSourceLabel=\{fundingAddressSourceLabel\}/);
  assert.match(page, /settlementOptionId=\{order\.sourceSettlementOptionId\}/);
  assert.match(modal, /<Dialog\.Portal>/);
  assert.match(modal, /<OrderSettlementIdentity assetCode=\{asset\} routeLabel=\{network\}/);
  assert.match(modal, /settlementOptionId=\{settlementOptionId\}/);
  assert.match(modal, /isNativeNetwork && \([\s\S]*?deposit-details-modal-native-network/);
  assert.match(modal, /<QRCodeSVG value=\{address\}/);
  assert.match(modal, /\{hasMemo && \(/);
  assert.match(modal, /onClick=\{\(\) => onCopy\(address\)\}/);
  assert.match(modal, /onClick=\{\(\) => onCopy\(memo!\)\}/);
  assert.doesNotMatch(modal, /fetch\(|useGet|useMutation|createAddress|generateAddress/);
});

test('Convert keeps its existing inline QR toggle rather than opening the Swap modal', () => {
  assert.match(page, /isQuickex \? \(\s*!showQR \? \(/);
  assert.match(page, /onClick=\{\(\) => setShowQR\(true\)\}/);
  assert.match(page, /onClick=\{\(\) => setShowQR\(false\)\}/);
});

test('only the X closes crypto deposit details; detection remains automatic', () => {
  assert.match(modal, /<Dialog\.Close asChild>/);
  assert.match(modal, /aria-label="Close deposit details"/);
  assert.match(modal, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(modal, /onInteractOutside=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(modal, /Blockchain payment detection is automatic/);
  assert.doesNotMatch(modal, /Mark as Paid|Cancel|onMarkPaid|markPaidMutation/);
});