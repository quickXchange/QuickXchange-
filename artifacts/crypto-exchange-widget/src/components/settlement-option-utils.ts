import type { SettlementOption } from '@workspace/api-client-react';

export function getUniqueSettlementOptions(config?: {
  manualSettlementOptions?: SettlementOption[];
  settlementOptions?: SettlementOption[];
} | null): SettlementOption[] {
  const source = config?.manualSettlementOptions || config?.settlementOptions || [];
  const unique: SettlementOption[] = [];
  const seen = new Set<string>();

  for (const option of source) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    unique.push(option);
  }

  return unique;
}