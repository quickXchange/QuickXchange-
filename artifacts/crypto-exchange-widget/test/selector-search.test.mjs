import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  convertInstrumentSearchText,
  normalizeSelectorSearchValue,
  selectorOptionMatchesQuery,
  settlementOptionSearchText,
} = await import(process.env.SELECTOR_SEARCH_MODULE);

test('selector matching normalizes whitespace, case, and accents while retaining partial matches', () => {
  assert.equal(normalizeSelectorSearchValue('  ÉTh  '), 'eth');
  assert.equal(selectorOptionMatchesQuery('Ethereum ERC20', '  erC '), true);
  assert.equal(selectorOptionMatchesQuery('Ethereum ERC20', 'the'), true);
  assert.equal(selectorOptionMatchesQuery('Ethereum ERC20', 'sol'), false);
});

test('Swap asset search matches ticker, network code, and network display name', () => {
  const usdtTron = settlementOptionSearchText({
    assetCode: 'USDT',
    kind: 'crypto-network',
    title: 'Tether',
    networkTitle: 'TRON',
    networkSlug: 'tron',
    routeNetwork: 'TRC20',
  });
  const usdcEthereum = settlementOptionSearchText({
    assetCode: 'USDC',
    kind: 'crypto-network',
    title: 'USD Coin',
    networkTitle: 'Ethereum',
    networkSlug: 'ethereum',
    routeNetwork: 'ERC20',
  });

  assert.equal(selectorOptionMatchesQuery(usdtTron, ' usd '), true);
  assert.equal(selectorOptionMatchesQuery(usdcEthereum, 'USD'), true);
  assert.equal(selectorOptionMatchesQuery(usdtTron, 'trc'), true);
  assert.equal(selectorOptionMatchesQuery(usdcEthereum, 'erc'), true);
  assert.equal(selectorOptionMatchesQuery(usdtTron, 'tron'), true);
});

test('Swap payment-method search finds SEPA and SEPA Instant by displayed name', () => {
  const sepa = settlementOptionSearchText({
    assetCode: 'EUR',
    kind: 'fiat-payment-method',
    title: 'SEPA',
    paymentMethodId: 'sepa',
  });
  const sepaInstant = settlementOptionSearchText({
    assetCode: 'EUR',
    kind: 'fiat-payment-method',
    title: 'SEPA Instant',
    paymentMethodId: 'sepa-instant',
  });
  const card = settlementOptionSearchText({
    assetCode: 'EUR',
    kind: 'fiat-payment-method',
    title: 'Bank card',
    paymentMethodId: 'bank-card',
  });

  assert.equal(selectorOptionMatchesQuery(sepa, 'sep'), true);
  assert.equal(selectorOptionMatchesQuery(sepaInstant, 'SEP'), true);
  assert.equal(selectorOptionMatchesQuery(card, 'sep'), false);
});

test('payment-method search does not match an unrelated method through hidden shared route metadata', () => {
  const card = settlementOptionSearchText({
    assetCode: 'EUR',
    kind: 'fiat-payment-method',
    title: 'Bank card',
    paymentMethodId: 'card',
    networkTitle: 'SEPA',
    networkSlug: 'sepa',
    routeNetwork: 'SEPA',
  });

  assert.equal(selectorOptionMatchesQuery(card, 'sep'), false);
});

test('Convert search includes displayed identity and instrument slug aliases', () => {
  const usdtTron = convertInstrumentSearchText({
    currencyTitle: 'USDT',
    networkTitle: 'TRON',
    fullName: 'Tether',
    currencyFriendlyTitle: 'Tether USD',
    slug: 'usdt-trc20',
  });

  assert.equal(selectorOptionMatchesQuery(usdtTron, 'usd'), true);
  assert.equal(selectorOptionMatchesQuery(usdtTron, 'trc'), true);
  assert.equal(selectorOptionMatchesQuery(usdtTron, 'tether'), true);
});

test('search filters only the already supplied eligible option set', () => {
  const eligible = [
    { id: 'usdt-tron', searchText: 'USDT TRC20 TRON' },
    { id: 'usdc-ethereum', searchText: 'USDC ERC20 Ethereum' },
  ];
  const filtered = eligible.filter(option =>
    selectorOptionMatchesQuery(option.searchText, 'usd'),
  );

  assert.deepEqual(filtered.map(option => option.id), ['usdt-tron', 'usdc-ethereum']);
  assert.equal(filtered.some(option => option.id === 'unavailable-usd-asset'), false);
});