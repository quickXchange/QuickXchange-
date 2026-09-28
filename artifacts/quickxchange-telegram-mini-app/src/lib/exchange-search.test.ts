import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exchangeOptionMatchesSearch,
  exchangeSelectorEmptyMessage,
  filterExchangeOptions,
  normalizeExchangeSearchValue,
} from './exchange-search';
import { PAYMENT_METHOD_CATALOG } from '../../../api-server/src/lib/global-payment-catalog';

test('selector search trims, normalizes accents, and ignores case', () => {
  assert.equal(normalizeExchangeSearchValue('  SÉPA  '), 'sepa');
  assert.equal(exchangeOptionMatchesSearch({ title: 'Instant SEPA Transfer' }, '  sep '), true);
  assert.equal(exchangeOptionMatchesSearch({ title: 'CaixaBank' }, 'CAIXA'), true);
});

test('selector search covers asset and network display names and codes', () => {
  const trcRoute = { title: 'Tether', assetCode: 'USDT', networkTitle: 'Tron', routeNetwork: 'TRC20' };
  const ercRoute = { title: 'Ethereum', assetCode: 'ETH', networkTitle: 'Ethereum', routeNetwork: 'ERC20' };

  assert.equal(exchangeOptionMatchesSearch(trcRoute, 'usd'), true);
  assert.equal(exchangeOptionMatchesSearch(trcRoute, 'TRC'), true);
  assert.equal(exchangeOptionMatchesSearch(ercRoute, 'erc'), true);
  assert.equal(exchangeOptionMatchesSearch(ercRoute, 'ethe'), true);
  assert.equal(exchangeOptionMatchesSearch(ercRoute, 'sol'), false);
});

test('searches a manualSettlementOptions-shaped projection of the real SEPA Instant catalog entry', () => {
  const method = PAYMENT_METHOD_CATALOG.find(item => item.id === 'sepa-instant');
  assert.ok(method, 'SEPA Instant must exist in the production payment-method catalog');

  // manualSettlementOptions is the direct listPublicFiatSettlementOptions projection:
  // title/name, paymentMethodId/catalog id, EUR assetCode, kind, family and regions.
  const option = {
    id: `fiat:eur:${method.id}`,
    assetId: 'eur',
    assetCode: 'EUR',
    routeNetwork: 'EUR',
    kind: 'fiat-payment-method',
    title: method.name,
    direction: method.direction,
    family: method.family,
    executionMode: method.executionMode,
    paymentMethodId: method.id,
    regions: [...method.regions],
    searchAliases: [],
  };

  for (const query of ['sep', 'sepa', 'SEPA', 's.e-p.a']) {
    assert.equal(exchangeOptionMatchesSearch(option, query), true, `expected query ${query} to match`);
  }
  assert.equal(exchangeOptionMatchesSearch(option, 'instant'), true);
  assert.equal(exchangeOptionMatchesSearch(option, 'eur'), true);
  assert.equal(exchangeOptionMatchesSearch(option, 'sepa-instant'), true);
  assert.equal(exchangeOptionMatchesSearch(option, 'swift'), false);

  const unrelatedBankOnSameRail = {
    id: 'fiat:eur:caixabank',
    assetId: 'eur',
    assetCode: 'EUR',
    routeNetwork: 'SEPA',
    networkTitle: 'SEPA',
    kind: 'fiat-payment-method',
    title: 'CaixaBank',
    paymentMethodId: 'caixabank',
    family: 'bank-transfer',
    regions: ['EEA'],
    searchAliases: [],
  };
  assert.equal(exchangeOptionMatchesSearch(unrelatedBankOnSameRail, 'sepa'), false);
  assert.deepEqual(
    filterExchangeOptions([option, unrelatedBankOnSameRail], 'fiat', 'sepa'),
    [option],
  );
});

test('Payment Methods filter includes only payment-method options', () => {
  const methods = [{
    id: 'fiat:eur:sepa-instant',
    kind: 'fiat-payment-method',
    title: 'SEPA Instant',
    assetCode: 'EUR',
    paymentMethodId: 'sepa-instant',
  }, {
    id: 'manual:cash',
    kind: 'payment-method',
    title: 'Cash',
  }];
  const unrelatedOptions = [
    { id: 'eur', kind: 'fiat', title: 'Euro', assetCode: 'EUR' },
    { id: 'bitcoin', kind: 'crypto-network', title: 'Bitcoin', assetCode: 'BTC' },
  ];

  assert.deepEqual(filterExchangeOptions([...methods, ...unrelatedOptions], 'fiat', ''), methods);
  assert.deepEqual(filterExchangeOptions([...methods, ...unrelatedOptions], 'fiat', 'sepa'), [methods[0]]);
});

test('payment method no-match state uses the exact selector contract', () => {
  assert.equal(exchangeSelectorEmptyMessage('fiat'), 'No payment methods found');
  assert.equal(exchangeSelectorEmptyMessage('all'), 'No matching options found.');
  assert.deepEqual(
    filterExchangeOptions([{ kind: 'fiat-payment-method', title: 'SEPA Instant' }], 'fiat', 'does-not-exist'),
    [],
  );
});