import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearQuotePreservingExchangeAmounts,
  findQuickexDefaultRoute,
  getCanonicalManualRoutes,
  getExchangePricingTermsKey,
  getManualRouteSourceIds,
  getManualRouteTargetIds,
  getQuickexConvertRoutes,
  parseExchangeQuoteAmount,
  resolveExchangeRouteSelection,
} from './exchange-routes';

const manualOptions = [
  { id: 'bank-eur', direction: 'send' },
  { id: 'btc-tron', direction: 'receive' },
  { id: 'eur-sepa', direction: 'both' },
  { id: 'disabled-source', direction: 'receive' },
  { id: 'disabled-target', direction: 'send' },
];
const manualRoutes = [
  { sourceSettlementOptionId: 'bank-eur', targetSettlementOptionId: 'btc-tron' },
  { sourceSettlementOptionId: 'bank-eur', targetSettlementOptionId: 'eur-sepa' },
  { sourceSettlementOptionId: 'disabled-source', targetSettlementOptionId: 'btc-tron' },
  { sourceSettlementOptionId: 'bank-eur', targetSettlementOptionId: 'disabled-target' },
  { sourceSettlementOptionId: 'missing-source', targetSettlementOptionId: 'btc-tron' },
];

test('blank or invalid amount input cannot schedule a quote', () => {
  assert.equal(parseExchangeQuoteAmount(''), 0);
  assert.equal(parseExchangeQuoteAmount('   '), 0);
  assert.equal(parseExchangeQuoteAmount('not-a-number'), 0);
  assert.equal(parseExchangeQuoteAmount('0'), 0);
  assert.equal(parseExchangeQuoteAmount('12.5'), 12.5);
});

test('Swap source and target selectors only expose canonical enabled directed routes', () => {
  const routes = getCanonicalManualRoutes(manualRoutes, manualOptions);
  assert.deepEqual(routes, manualRoutes.slice(0, 2));
  assert.deepEqual([...getManualRouteSourceIds(routes)], ['bank-eur']);
  assert.deepEqual([...getManualRouteTargetIds(routes, 'bank-eur')], ['btc-tron', 'eur-sepa']);
});

test('Swap chooses configured default, retains valid manual choice, and resets removed routes', () => {
  const routes = getCanonicalManualRoutes(manualRoutes, manualOptions);
  const routeChoices = routes.map((route) => ({
    sourceId: route.sourceSettlementOptionId,
    targetId: route.targetSettlementOptionId,
  }));
  const defaultPair = { sourceId: 'bank-eur', targetId: 'eur-sepa' };

  assert.deepEqual(resolveExchangeRouteSelection(routeChoices, null, defaultPair), defaultPair);
  assert.deepEqual(
    resolveExchangeRouteSelection(routeChoices, { sourceId: 'bank-eur', targetId: 'btc-tron' }, defaultPair),
    { sourceId: 'bank-eur', targetId: 'btc-tron' },
  );
  assert.deepEqual(
    resolveExchangeRouteSelection([routeChoices[0]], defaultPair, defaultPair),
    routeChoices[0],
  );
  assert.equal(resolveExchangeRouteSelection([], defaultPair, defaultPair), undefined);
});

const instruments = [
  { slug: 'btc-tron', instrumentType: 'crypto', currencyTitle: 'BTC', networkTitle: 'TRON' },
  { slug: 'btc-ethereum', instrumentType: 'crypto', currencyTitle: 'BTC', networkTitle: 'Ethereum' },
  { slug: 'usdt-tron', instrumentType: 'crypto', currencyTitle: 'USDT', networkTitle: 'TRON' },
  { slug: 'unsupported', instrumentType: 'fiat', currencyTitle: 'USD', networkTitle: 'Bank' },
];
const convertPairs = [
  { fromAsset: 'BTC', fromNetwork: 'TRON', toAsset: 'USDT', toNetwork: 'TRON' },
  { fromAsset: 'BTC', fromNetwork: 'Ethereum', toAsset: 'BTC', toNetwork: 'TRON' },
];

test('Convert selectors and defaults resolve only exact directed Quickex pairs, never a Cartesian product', () => {
  const routes = getQuickexConvertRoutes(instruments, convertPairs);
  assert.deepEqual(routes.map(({ sourceId, targetId }) => [sourceId, targetId]), [
    ['btc-tron', 'usdt-tron'],
    ['btc-ethereum', 'btc-tron'],
  ]);

  const configuredDefault = findQuickexDefaultRoute(routes, {
    fromAsset: 'btc',
    fromNetwork: ' ethereum ',
    toAsset: 'BTC',
    toNetwork: 'tron',
  });
  assert.deepEqual(
    configuredDefault && { sourceId: configuredDefault.sourceId, targetId: configuredDefault.targetId },
    { sourceId: 'btc-ethereum', targetId: 'btc-tron' },
  );
  assert.deepEqual(
    findQuickexDefaultRoute(routes)?.pair,
    convertPairs[0],
  );
});

test('catalog refresh clears the signed quote but preserves both entered amounts and active side', () => {
  const formState = {
    amount: '0.25',
    desiredReceiveAmount: '19.5',
    activeAmountSide: 'receive' as const,
  };

  assert.deepEqual(clearQuotePreservingExchangeAmounts(formState), {
    amount: '0.25',
    desiredReceiveAmount: '19.5',
    activeAmountSide: 'receive',
    quoteData: null,
  });
});

test('identical pricing polls keep their semantic key while changed terms invalidate it', () => {
  const pricing = {
    sourceSettlementOptionId: 'bank-eur',
    targetSettlementOptionId: 'btc-tron',
    fromAsset: 'EUR',
    toAsset: 'BTC',
    rate: 0.000025,
    minAmount: 20,
    maxAmount: 20000,
    pricingRuleName: 'EUR to BTC',
  };
  const currentTerms = getExchangePricingTermsKey(pricing, 'bank-eur', 'btc-tron');
  assert.equal(
    getExchangePricingTermsKey({ ...pricing }, 'bank-eur', 'btc-tron'),
    currentTerms,
  );
  assert.notEqual(
    getExchangePricingTermsKey({ ...pricing, rate: 0.000026 }, 'bank-eur', 'btc-tron'),
    currentTerms,
  );
  assert.equal(getExchangePricingTermsKey(pricing, 'bank-eur', 'eur-sepa'), '');
});