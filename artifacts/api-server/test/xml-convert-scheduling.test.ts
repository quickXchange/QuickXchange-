import assert from "node:assert/strict";
import test from "node:test";
import { selectConvertXmlBatch } from "../src/lib/rates-xml-convert-scheduling";
import { partnerPairKey, type PartnerPair } from "../src/lib/quickex-xml-public";

function pair(source: string, target: string): PartnerPair {
  const instrument = (code: string) => ({
    currencyTitle: code, networkTitle: code, slug: code,
    bestChangeCurrencyName: code, reservesAmount: "100",
  });
  return { instrumentFrom: instrument(source), instrumentTo: instrument(target),
    isActive: true, minAmount: "1", maxAmount: "100" };
}

test("a saturated renewal queue cannot starve unquoted affiliate directions", () => {
  const warm = Array.from({ length: 256 }, (_, i) => pair("WARM", `TARGET${i}`));
  const cold = Array.from({ length: 768 }, (_, i) => pair(`SOURCE${i % 16}`, `COLD${i}`));
  const rows = new Map(warm.map(p => [partnerPairKey(p), { quotedAt: 0 }]));
  const attempted = new Map<string, number>();
  let sequence = 0;
  // Simulate a loaded publisher whose warm rates are always due for renewal.
  // Old scheduling selected those same 256 and never reached a cold pair.
  for (let cycle = 0; cycle < 12; cycle++) {
    const batch = selectConvertXmlBatch([...warm, ...cold.filter(p => !attempted.has(partnerPairKey(p)))],
      rows, attempted, 241_000, 300_000, 256);
    assert.equal(batch.length, 256);
    assert.equal(batch.filter(p => !rows.has(partnerPairKey(p))).length, 64);
    for (const p of batch) attempted.set(partnerPairKey(p), sequence++);
  }
  assert.ok(cold.every(p => attempted.has(partnerPairKey(p))), "every later direction must receive an attempt");
});

test("catalogues larger than a batch rotate sources as well as destinations", () => {
  const pairs = Array.from({ length: 300 }, (_, i) =>
    [pair(`SOURCE${i}`, "BTC"), pair(`SOURCE${i}`, "USDT")]).flat();
  const attempted = new Map<string, number>();
  let sequence = 0;
  for (let cycle = 0; cycle < 3; cycle++) {
    const batch = selectConvertXmlBatch(pairs, new Map(), attempted, 0, 300_000, 256);
    assert.equal(new Set(batch.map(partnerPairKey)).size, 256, "no duplicate direction in a batch");
    if (cycle === 0) assert.equal(new Set(batch.map(p => p.instrumentFrom.currencyTitle)).size, 256);
    for (const p of batch) attempted.set(partnerPairKey(p), sequence++);
  }
  assert.equal(attempted.size, pairs.length, "later source currencies cannot starve behind a catalogue prefix");
});

test("renewal-only and discovery-only batches use all available capacity", () => {
  const pairs = Array.from({ length: 300 }, (_, i) => pair("BTC", `TARGET${i}`));
  const rows = new Map(pairs.map((p, i) => [partnerPairKey(p), { quotedAt: i }]));
  assert.deepEqual(selectConvertXmlBatch(pairs, rows, new Map(), 241_000, 300_000, 256), pairs.slice(0, 256));
  assert.equal(selectConvertXmlBatch(pairs, new Map(), new Map(), 241_000, 300_000, 256).length, 256);
});
