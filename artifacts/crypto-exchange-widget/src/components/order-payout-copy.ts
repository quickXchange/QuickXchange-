import { viewOrderStep2Rows } from './view-order-fields';

type Detail = { key: string; label: string; value: string };
type PayoutOrder = {
  step2Details?: readonly Detail[];
  settlementSnapshot?: { [key: string]: unknown } | null;
  settlementDetails?: { [key: string]: unknown } | null;
  receiveAmount: string;
  toAsset: string;
};

const words = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Clipboard export only. Never read account/profile data or recompute money. */
export function orderPayoutCopyText(order: PayoutOrder): string {
  const definitions = Array.isArray(order.settlementSnapshot?.requiredFields)
    ? order.settlementSnapshot.requiredFields as Array<{ key?: string; type?: string }>
    : [];
  const buckets: string[][] = [[], [], [], []];
  const seen = new Set<string>();
  const rows = viewOrderStep2Rows(order.step2Details).slice().sort((a, b) =>
    Number(/^(target|receiving)\b/.test(words(b.key))) - Number(/^(target|receiving)\b/.test(words(a.key))));
  for (const row of rows) {
    const key = words(row.key);
    const label = words(row.label);
    const identity = `${key} ${label}`;
    const definition = definitions.find(field => field && field.key === row.key);
    // The safe projection may trim whitespace. Recover the exact saved string
    // only for the same projected field and value, never an unmatched raw map.
    const savedValue = order.settlementDetails?.[row.key];
    const value = typeof savedValue === 'string' && savedValue.trim() === row.value.trim()
      ? savedValue : row.value;
    // Standard name/email rows describe the customer, not the payment account.
    if (['name', 'email', 'contact email', 'customer name', 'customer email'].includes(key)
      && !['account-name', 'account-iban', 'account-number'].includes(definition?.type ?? '')) continue;
    if (/^(?:source|sending|sender|refund)\b/.test(key)
      || /^(?:source|sending|sender|refund)\b/.test(label)) continue;
    if (/\b(?:telegram|whatsapp|instagram|facebook|twitter|tiktok|discord|social|contact|profile|username)\b/.test(identity)
      || /(?:https?:\/\/|www\.|t\.me\/|wa\.me\/)/i.test(value)) continue;
    if (/\b(?:email|phone|mobile)\b/.test(identity)
      && !/\b(?:account|payment|payout|wallet|recipient|beneficiary)\b/.test(identity)
      && !definition) continue;
    const semantic = identity.replace(/\b(?:source|target|receiving|recipient|beneficiary|custom)\b/g, ' ');
    let group = 3;
    let outputLabel = row.label;
    if (definition?.type === 'account-name' || label === 'name'
      || /\b(?:account holder|account name|holder name|recipient name|beneficiary name|full name|payee name)\b/.test(identity)
      || /^(?:target|receiving|recipient|beneficiary) (?:custom )?name$/.test(key)) {
      group = 0;
      outputLabel = 'Name';
    } else if (definition?.type === 'account-iban' || /\biban\b/.test(semantic)) {
      group = 1;
      outputLabel = 'IBAN';
    } else if (definition?.type === 'account-number' || /\baccount (?:number|no)\b|\bbank account\b/.test(semantic)) {
      group = 1;
      outputLabel = 'Account Number';
    } else if (/\b(?:account id|payment id|wallet id|card number|payment identifier|bank detail)\b/.test(semantic)) {
      group = 1;
    } else if (/\b(?:payment description|payment reference|transfer reference|remittance|reference|description)\b/.test(semantic)) {
      group = 2;
      outputLabel = 'Payment Description';
    } else if (['destination address', 'destination memo'].includes(key)) {
      group = 1;
      outputLabel = key === 'destination address' ? 'Payment Address' : 'Memo / Tag';
    }
    // Receiving names outrank legacy unscoped names; preserve all distinct
    // required identifiers (e.g. IBAN and SWIFT), never synthesize a missing one.
    if (group === 0 && buckets[0].length) continue;
    const signature = `${outputLabel}:${value}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    buckets[group].push(`${outputLabel}: ${value}`);
  }
  return [...buckets.flat(), `Amount: ${order.receiveAmount} ${order.toAsset}`].join('\n');
}
