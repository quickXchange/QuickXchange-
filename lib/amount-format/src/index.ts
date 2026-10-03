/**
 * Human-facing presentation ONLY. Never use this output for an input value,
 * quote, transfer, API payload, storage, accounting, or a machine-readable feed.
 */
export const AMOUNT_DISPLAY_DECIMALS = 3;
export type DisplayAmount = string | number | bigint | null | undefined;

/** Keep editable input state exact; round only its unfocused presentation. */
export function formatAmountInputValue(value: string, editing: boolean): string {
  if (editing || value === "") return value;
  const formatted = formatDisplayAmount(value);
  return formatted === "—" ? value : formatted;
}

export function formatDisplayAmount(
  value: DisplayAmount,
  options: Intl.NumberFormatOptions = {},
  locale?: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value).trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || !(match[2] || match[3])) return "—";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000 || text.length > 2000) return "—";
  const negative = match[1] === "-";
  let units = BigInt((match[2] || "0") + (match[3] || ""));
  // Percent formatting scales by 100; round the actual displayed percentage.
  const scale = (match[3]?.length ?? 0) - exponent - (options.style === "percent" ? 2 : 0);
  const shift = scale - AMOUNT_DISPLAY_DECIMALS;
  if (shift > 0) {
    const divisor = 10n ** BigInt(shift);
    units = units / divisor + (units % divisor * 2n >= divisor ? 1n : 0n);
  } else {
    units *= 10n ** BigInt(-shift);
  }
  const digits = units.toString().padStart(AMOUNT_DISPLAY_DECIMALS + 1, "0");
  const integer = digits.slice(0, -AMOUNT_DISPLAY_DECIMALS);
  const fraction = digits.slice(-AMOUNT_DISPLAY_DECIMALS).replace(/0+$/, "");
  const rounded = `${negative && units !== 0n ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
  if (!locale && !options.style && !options.notation && !options.useGrouping) return rounded;
  const formatter = new Intl.NumberFormat(locale ?? "en-US", {
    ...options,
    minimumFractionDigits: 0,
    maximumFractionDigits: AMOUNT_DISPLAY_DECIMALS,
    minimumSignificantDigits: undefined,
    maximumSignificantDigits: undefined,
  });
  // Modern Intl supports exact decimal strings (without binary Number coercion).
  // Percent is already scaled/rounded above; preserve its affix via parts.
  if (options.style === "percent") {
    const parts = formatter.formatToParts(negative && units !== 0n ? -1 : 1);
    const numeric = formatDisplayAmount(rounded, { useGrouping: options.useGrouping }, locale ?? "en-US");
    const first = parts.findIndex(part => part.type === "integer");
    let last = first;
    for (let i = first; i < parts.length; i++) {
      if (["integer", "group", "decimal", "fraction"].includes(parts[i].type)) last = i;
    }
    return parts.slice(0, first).filter(part => part.type !== "minusSign").map(part => part.value).join("")
      + numeric + parts.slice(last + 1).map(part => part.value).join("");
  }
  return formatter.format(rounded as unknown as number);
}