import { partnerPairKey, type PartnerPair } from "./quickex-xml-public";

/** Reserve discovery capacity even when renewing existing quotes fills a batch. */
export function selectConvertXmlBatch(
  due: PartnerPair[],
  rows: ReadonlyMap<string, { quotedAt: number }>,
  attempted: ReadonlyMap<string, number>,
  now: number,
  validityMs: number,
  limit: number,
) {
  const renewals: PartnerPair[] = [];
  const discovery = new Map<string, PartnerPair[]>();
  for (const pair of due) {
    const row = rows.get(partnerPairKey(pair));
    if (row && row.quotedAt <= now && now - row.quotedAt < validityMs) {
      renewals.push(pair);
    } else {
      const source = JSON.stringify([pair.instrumentFrom.currencyTitle, pair.instrumentFrom.networkTitle]);
      const group = discovery.get(source) ?? [];
      group.push(pair);
      discovery.set(source, group);
    }
  }
  renewals.sort((a, b) => rows.get(partnerPairKey(a))!.quotedAt - rows.get(partnerPairKey(b))!.quotedAt);
  const lastAttempt = (pair: PartnerPair) => attempted.get(partnerPairKey(pair)) ?? -1;
  const groups = [...discovery.values()];
  const sourceAttempt = new Map(groups.map(group => [
    group, group.reduce((latest, pair) => Math.max(latest, lastAttempt(pair)), -1),
  ]));
  for (const group of groups) group.sort((a, b) => lastAttempt(a) - lastAttempt(b));
  groups.sort((a, b) => sourceAttempt.get(a)! - sourceAttempt.get(b)!);
  // Interleave source currencies instead of draining the catalogue's first
  // currency before ever reaching BTC, ETH, USDT, and later instruments.
  const explorers: PartnerPair[] = [];
  for (let depth = 0; explorers.length < limit; depth++) {
    let added = false;
    for (const group of groups) {
      if (group[depth]) { explorers.push(group[depth]); added = true; }
      if (explorers.length === limit) break;
    }
    if (!added) break;
  }
  const batch: PartnerPair[] = [];
  let renewal = 0, explorer = 0;
  while (batch.length < limit && (renewal < renewals.length || explorer < explorers.length)) {
    // At least one quarter of a saturated batch explores unquoted/expired
    // directions. Unused capacity goes to whichever queue still has work.
    if (explorer < explorers.length && (batch.length % 4 === 3 || renewal === renewals.length))
      batch.push(explorers[explorer++]);
    else if (renewal < renewals.length) batch.push(renewals[renewal++]);
    else break;
  }
  return batch;
}
