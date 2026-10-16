import assert from 'node:assert/strict';
import test from 'node:test';

const { orderPayoutCopyText } = await import(process.env.ORDER_PAYOUT_COPY_MODULE);
const row = (key, label, value) => ({ key, label, value });
const order = (rows, extra = {}) => ({
  receiveAmount: '250.00', toAsset: 'EUR', amount: '999',
  customerName: 'WRONG PROFILE', customerEmail: 'private@example.test',
  step2Details: rows, ...extra,
});

test('SEPA copies saved recipient, IBAN and reference in order, then exact payout', () => {
  const result = orderPayoutCopyText(order([
    row('name', 'Name', 'WRONG PROFILE'),
    row('email', 'Email', 'private@example.test'),
    row('target_reference', 'Payment Reference', 'ORDER PAYMENT'),
    row('target_iban', 'IBAN', 'FR76 0000'),
    row('target_account_holder', 'Account Holder', 'JOHN SMITH'),
  ]));
  assert.equal(result, 'Name: JOHN SMITH\nIBAN: FR76 0000\nPayment Description: ORDER PAYMENT\nAmount: 250.00 EUR');
});

test('domestic banks retain account identifiers, SWIFT, routing and bank fields', () => {
  assert.equal(orderPayoutCopyText(order([
    row('target_holder', 'Recipient Name', 'Jane & Co'),
    row('target_number', 'Account Number', '000123-0456'),
    row('target_bank', 'Bank Name', 'Saved Bank'),
    row('target_swift', 'BIC/SWIFT', 'ABCDFRPP'),
    row('target_routing', 'Routing Number', '001234567'),
  ])), 'Name: Jane & Co\nAccount Number: 000123-0456\nBank Name: Saved Bank\nBIC/SWIFT: ABCDFRPP\nRouting Number: 001234567\nAmount: 250.00 EUR');
});

test('source accounts, profile name, social handles and unrelated contacts never leak', () => {
  const result = orderPayoutCopyText(order([
    row('source_account_holder', 'Account Holder', 'SENDER'),
    row('source_iban', 'IBAN', 'SOURCE IBAN'),
    row('name', 'Name', 'WRONG PROFILE'),
    row('telegram', 'Telegram', '@private'),
    row('custom_whatsapp', 'WhatsApp', '+123'),
    row('social', 'Social', 'https://example.test'),
    row('contactPhone', 'Phone', '+456'),
    row('refundAddress', 'Refund Address', 'refund'),
    row('target_account_holder', 'Account Holder', 'RECIPIENT'),
  ]));
  assert.equal(result, 'Name: RECIPIENT\nAmount: 250.00 EUR');
});

test('missing optional fields are omitted without catalog or account fallback', () => {
  assert.equal(orderPayoutCopyText(order([], { payoutMethod: 'Not customer data' })), 'Amount: 250.00 EUR');
  assert.equal(orderPayoutCopyText(order([row('target_iban', 'IBAN', '')])), 'Amount: 250.00 EUR');
});

test('payment email and mobile-money identifiers survive, but contact email does not', () => {
  const result = orderPayoutCopyText(order([
    row('account_email', 'Payment Account Email', 'payee@example.test'),
    row('payment_mobile', 'Mobile Money Account', '+001 234 567'),
    row('contact_email', 'Contact Email', 'never@example.test'),
  ]));
  assert.equal(result, 'Payment Account Email: payee@example.test\nMobile Money Account: +001 234 567\nAmount: 250.00 EUR');
});

test('frozen field types resolve localized/custom field labels without current Admin config', () => {
  const result = orderPayoutCopyText(order([
    row('target_field_a', 'Titulaire du compte', 'Émilie Dupont'),
    row('target_field_b', 'Numéro bancaire', '00001234'),
  ], { settlementSnapshot: { requiredFields: [
    { key: 'target_field_a', type: 'account-name' },
    { key: 'target_field_b', type: 'account-number' },
  ] } }));
  assert.equal(result, 'Name: Émilie Dupont\nAccount Number: 00001234\nAmount: 250.00 EUR');
});

test('crypto payout address and memo retain provider precision and original currency', () => {
  assert.equal(orderPayoutCopyText(order([
    row('destinationAddress', 'Receiving Address', 'exact-destination'),
    row('destinationMemo', 'Receiving Memo / Tag', '000234'),
    row('refundAddress', 'Refund Address', 'not-payout'),
  ], { receiveAmount: '12345678901234567890.000000000000000001', toAsset: 'USDT' })),
  'Payment Address: exact-destination\nMemo / Tag: 000234\nAmount: 12345678901234567890.000000000000000001 USDT');
});

test('does not mutate order data or normalize saved customer values', () => {
  const input = order([row('target_iban', 'IBAN', '  FR76 0000  ')]);
  const before = JSON.stringify(input);
  assert.match(orderPayoutCopyText(input), /IBAN:   FR76 0000  \n/);
  assert.equal(JSON.stringify(input), before);
});

test('receiving recipient wins over an ambiguous legacy account name', () => {
  assert.equal(orderPayoutCopyText(order([
    row('accountHolder', 'Account Holder', 'LEGACY'),
    row('target_account_holder', 'Account Holder', 'SAVED RECIPIENT'),
  ])), 'Name: SAVED RECIPIENT\nAmount: 250.00 EUR');
});

test('non-bank payment identifiers retain their correct labels', () => {
  assert.equal(orderPayoutCopyText(order([
    row('target_payment_id', 'Payment Account ID', '000-Exact-ID'),
  ])), 'Payment Account ID: 000-Exact-ID\nAmount: 250.00 EUR');
});

test('recover exact saved whitespace only for proven projected fields, never raw extras', () => {
  assert.equal(orderPayoutCopyText(order([
    row('target_iban', 'IBAN', 'FR76 0000'),
  ], { settlementDetails: { target_iban: '  FR76 0000  ', telegram: '@hidden' } })),
  'IBAN:   FR76 0000  \nAmount: 250.00 EUR');
  assert.equal(orderPayoutCopyText(order([
    row('target_iban', 'IBAN', 'FR76 0000'),
  ], { settlementDetails: { target_iban: 'DIFFERENT ACCOUNT' } })),
  'IBAN: FR76 0000\nAmount: 250.00 EUR');
});
