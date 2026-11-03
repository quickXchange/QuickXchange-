import { useEffect } from 'react';

// Explicit allowlist. Never persist email, names, addresses, payment fields,
// quote tickets, acceptance, order results, credentials or idempotency keys.
const fields = {
  swap: ['fromId', 'toId', 'amount', 'desiredReceiveAmount', 'activeAmountSide'],
  convert: ['fromSlug', 'toSlug', 'amount', 'receiveAmount', 'activeAmountSide', 'rateMode'],
  mode: ['value'],
} as const;
type Kind = keyof typeof fields;
const lifetime = 24 * 60 * 60 * 1000;

export function readExchangeDraft(kind: Kind): Record<string, string> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`qx:draft:${kind}`) || 'null');
    if (!saved || !Number.isFinite(saved.at) || saved.at > Date.now() || Date.now() - saved.at > lifetime) return {};
    const result: Record<string, string> = {};
    for (const key of fields[kind]) {
      const value = saved.values?.[key];
      if (typeof value !== 'string' || value.length > 150) continue;
      if (/amount/i.test(key) && !/^(?:\d*(?:\.\d*)?)$/.test(value)) continue;
      if (key === 'activeAmountSide' && !['send', 'receive'].includes(value)) continue;
      if (key === 'rateMode' && !['FIXED', 'FLOATING'].includes(value)) continue;
      if (key === 'value' && !['swap', 'convert'].includes(value)) continue;
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveExchangeDraft(kind: Kind, values: Record<string, string>) {
  const allowed = Object.fromEntries(fields[kind].map(key => [key, values[key]]).filter(([, value]) => typeof value === 'string'));
  try {
    sessionStorage.setItem(`qx:draft:${kind}`, JSON.stringify({ at: Date.now(), values: allowed }));
  } catch {
    // Private browsing / full storage must not prevent navigation or quoting.
  }
}

export function useExchangeDraft(kind: 'swap' | 'convert', values: Record<string, string>) {
  const serialized = JSON.stringify(values);
  useEffect(() => {
    saveExchangeDraft(kind, JSON.parse(serialized));
  }, [kind, serialized]);
}
