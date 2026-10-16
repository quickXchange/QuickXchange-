import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { pool } from '@workspace/db';
import { getManualDeskEstimate } from '../src/lib/manual-desk-rates';
import { pricingRuleMatchesSide, visiblePricingSelection } from '../../crypto-exchange-widget/src/components/pricing-rule-filter';

after(() => pool.end());

// Synthetic in-memory configurations only. Exercise the real Swap estimate
// engine without changing any saved pricing rules or calling a provider.
for (const side of ['send', 'receive'] as const) {
  test(`confirmed ${side}-filtered percentage and exact fixed fee feed the existing Swap estimate`, async () => {
    const original = [
      { id: 'send', sourceAsset: 'EUR', targetAsset: null, markupBasisPoints: 75, fixedFee: '0.5' },
      { id: 'receive', sourceAsset: null, targetAsset: 'XMR', markupBasisPoints: 75, fixedFee: '0.5' },
      { id: 'fallback', sourceAsset: null, targetAsset: null, markupBasisPoints: 75, fixedFee: '0.5' },
    ];
    const matching = original.filter(rule => pricingRuleMatchesSide(rule, side));
    const approved = visiblePricingSelection(matching, ['send', 'receive', 'fallback']);
    assert.deepEqual(approved.map(rule => rule.id), [side]);
    const patch = { markupBasisPoints: 250, fixedFee: '0.123456' };
    const updated = original.map(rule => approved.some(selected => selected.id === rule.id)
      ? { ...rule, ...patch } : rule);
    for (const rule of updated) {
      const quote = await getManualDeskEstimate({
        sourceCurrency: 'EUR', targetCurrency: 'XMR', targetPrecision: 6,
        amount: 100, exactRate: '1.1',
        markupBasisPoints: rule.markupBasisPoints, fixedFee: rule.fixedFee,
      });
      assert.equal(quote.exact.grossMarketAmount, '110');
      assert.equal(quote.exact.receiveAmount, rule.id === side ? '107.126544' : '108.675');
      if (rule.id !== side) assert.deepEqual(rule, original.find(item => item.id === rule.id));
    }
  });
}
