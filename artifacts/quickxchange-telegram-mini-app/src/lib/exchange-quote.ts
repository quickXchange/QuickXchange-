type SettlementField = {
  key: string;
  type?: string;
  enabled?: boolean;
  required?: boolean;
  requiredWhen?: { fieldKey: string; equals: string | string[] };
};

export function isExchangeFieldVisible(
  field: SettlementField,
  values: Record<string, string>,
): boolean {
  if (field.enabled === false) return false;
  const condition = field.requiredWhen;
  if (!condition) return true;
  return Array.isArray(condition.equals)
    ? condition.equals.includes(values[condition.fieldKey])
    : values[condition.fieldKey] === condition.equals;
}

export function isExchangeFieldRequired(field: SettlementField): boolean {
  return Boolean(field.required || field.requiredWhen);
}

export function isConvertDedicatedSettlementField(field: SettlementField): boolean {
  // These exact keys are consumed by QuickexOrderInput's dedicated fields.
  // Manual Swap settlement fields are Admin-owned, so none are reserved there.
  return field.key === 'destinationAddress' || field.key === 'destinationMemo';
}

export function buildSettlementDetails(
  fields: SettlementField[],
  values: Record<string, string>,
): Record<string, string | number> {
  return Object.fromEntries(fields.flatMap((field) => {
      if (!isExchangeFieldVisible(field, values)) return [];
      const value = values[field.key] ?? '';
      if (value === '' && !isExchangeFieldRequired(field)) return [];
      const numeric = ['number', 'integer', 'numeric', 'decimal'].includes(field.type ?? '');
      return [[field.key, numeric && value !== '' ? Number(value) : value]];
    }));
}