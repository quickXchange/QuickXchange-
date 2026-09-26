import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeOptionMatchesSearch, normalizeExchangeSearchValue } from './exchange-search';

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

test('selector search includes payment method identity and explicit aliases', () => {
  const option = {
    title: 'European Bank SEPA Instant',
    assetCode: 'EUR',
    paymentMethodId: 'sepa-instant',
    searchAliases: ['European bank transfer'],
  };

  assert.equal(exchangeOptionMatchesSearch(option, 'sep'), true);
  assert.equal(exchangeOptionMatchesSearch(option, 'bank'), true);
  assert.equal(exchangeOptionMatchesSearch(option, 'european'), true);
  assert.equal(exchangeOptionMatchesSearch(option, '   '), true);
});