import { ApiError } from "./api-error";

export type ManualReceiveQuoteSolverInput = {
  desiredReceiveAmount: number;
  minAmount: number;
  maxAmount?: number;
  initialUpperAmount: number;
  tierBoundaries?: readonly number[];
  receiveQuantum?: number;
  maxAttempts?: number;
  deadlineAt?: number;
  quote: (amount: number) => Promise<number>;
};

const DEFAULT_MAX_ATTEMPTS = 48;
const DEFAULT_DEADLINE_MS = 10_000;
const MAX_UNBOUNDED_EXPANSIONS = 24;
const SOURCE_RELATIVE_TOLERANCE = 1e-9;
const SOURCE_ABSOLUTE_TOLERANCE = 1e-12;

function budgetExceeded(): ApiError {
  return new ApiError(
    "MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED",
    "The receive quote could not be solved within the bounded pricing time and attempt budget. Please try again.",
    503,
  );
}

export async function beforeManualReceiveDeadline<T>(
  operation: Promise<T>,
  deadlineAt: number,
): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw budgetExceeded();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(budgetExceeded()), remainingMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function effectiveManualReceiveTarget(
  desiredReceiveAmount: number,
  targetMinAmount?: number,
  targetMaxAmount?: number,
): number | undefined {
  if (!Number.isFinite(desiredReceiveAmount) || desiredReceiveAmount <= 0) {
    return undefined;
  }
  const minimum = targetMinAmount == null ? 0 : targetMinAmount;
  if (!Number.isFinite(minimum) || minimum < 0) return undefined;
  if (targetMaxAmount != null &&
      (!Number.isFinite(targetMaxAmount) || targetMaxAmount < minimum ||
        desiredReceiveAmount > targetMaxAmount)) {
    return undefined;
  }
  return Math.max(desiredReceiveAmount, minimum);
}

function nextPositiveFloat(value: number, direction: "up" | "down"): number {
  if (value <= 0 || !Number.isFinite(value)) return value;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  view.setBigUint64(0, direction === "up" ? bits + 1n : bits - 1n);
  return view.getFloat64(0);
}

/**
 * Uses the signed forward quote builder as its pricing oracle. Tier boundaries
 * are evaluated as isolated points, with open intervals searched on either
 * side: a tier can change exactly at its minimum and make the boundary point
 * price differently from every value immediately above it.
 *
 * The quote-call count, bracketing expansions, and wall-clock duration are
 * hard bounded. Exhausting a budget raises 503 rather than returning an
 * unverified or materially oversized source amount.
 */
export async function solveManualReceiveQuote(
  input: ManualReceiveQuoteSolverInput,
): Promise<{ amount: number; receiveAmount: number } | undefined> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const deadlineAt = input.deadlineAt ?? Date.now() + DEFAULT_DEADLINE_MS;
  if (
    !Number.isFinite(input.desiredReceiveAmount) || input.desiredReceiveAmount <= 0 ||
    !Number.isFinite(input.minAmount) || input.minAmount <= 0 ||
    (input.maxAmount !== undefined &&
      (!Number.isFinite(input.maxAmount) || input.maxAmount < input.minAmount)) ||
    !Number.isFinite(input.initialUpperAmount) || input.initialUpperAmount <= 0 ||
    (input.receiveQuantum !== undefined &&
      (!Number.isFinite(input.receiveQuantum) || input.receiveQuantum <= 0)) ||
    !Number.isInteger(maxAttempts) || maxAttempts < 1
  ) return undefined;

  const cache = new Map<number, number>();
  let attempts = 0;
  const evaluate = async (amount: number): Promise<number> => {
    const cached = cache.get(amount);
    if (cached !== undefined) return cached;
    if (attempts >= maxAttempts || Date.now() >= deadlineAt) {
      throw budgetExceeded();
    }
    attempts++;
    const result = await beforeManualReceiveDeadline(input.quote(amount), deadlineAt);
    if (!Number.isFinite(result)) {
      throw new ApiError(
        "MANUAL_RECEIVE_QUOTE_INVALID",
        "Forward pricing returned an invalid receive amount.",
        503,
      );
    }
    cache.set(amount, result);
    return result;
  };

  const sourceTolerance = (amount: number) =>
    Math.max(SOURCE_ABSOLUTE_TOLERANCE, Math.abs(amount) * SOURCE_RELATIVE_TOLERANCE);

  const refineBracket = async (
    lowAmount: number,
    lowReceive: number,
    highAmount: number,
    highReceive: number,
  ): Promise<{ amount: number; receiveAmount: number }> => {
    let low = lowAmount;
    let lowValue = lowReceive;
    let high = highAmount;
    let highValue = highReceive;
    if (lowValue >= input.desiredReceiveAmount) {
      return { amount: low, receiveAmount: lowValue };
    }
    if (highValue < input.desiredReceiveAmount) {
      throw new Error("receive solver received an invalid bracket");
    }
    // Safeguarded false-position steps converge quickly for the piecewise
    // linear desk formulas while midpoint fallback guarantees bounded progress.
    for (let iteration = 0; iteration < maxAttempts; iteration++) {
      if (high - low <= sourceTolerance(high)) {
        return { amount: high, receiveAmount: highValue };
      }
      const receiveSpan = highValue - lowValue;
      let candidate: number;
      if (highValue === input.desiredReceiveAmount && input.receiveQuantum !== undefined) {
        const slope = receiveSpan / (high - low);
        const sourcePerReceiveUnit = slope > 0
          ? input.receiveQuantum / slope
          : (high - low) / 2;
        candidate = high - sourcePerReceiveUnit;
        if (candidate <= low || candidate >= high) {
          candidate = low + (high - low) / 2;
        }
      } else if (highValue === input.desiredReceiveAmount) {
        return { amount: high, receiveAmount: highValue };
      } else {
        const fraction = receiveSpan > 0
          ? (input.desiredReceiveAmount - lowValue) / receiveSpan
          : 0.5;
        let fractionSafe = fraction;
        if (!Number.isFinite(fractionSafe) || fractionSafe <= 0.05 || fractionSafe >= 0.95) {
          fractionSafe = 0.5;
        }
        candidate = low + (high - low) * fractionSafe;
      }
      if (candidate <= low || candidate >= high) {
        return { amount: high, receiveAmount: highValue };
      }
      const candidateReceive = await evaluate(candidate);
      if (candidateReceive >= input.desiredReceiveAmount) {
        high = candidate;
        highValue = candidateReceive;
      } else {
        low = candidate;
        lowValue = candidateReceive;
      }
      // Once source uncertainty is below the amount represented by one
      // receive-unit, additional forward calls cannot improve the displayed
      // receive precision in a useful way.
      const quantum = input.receiveQuantum;
      if (
        quantum !== undefined &&
        highValue - input.desiredReceiveAmount < quantum &&
        high - low <= Math.max(sourceTolerance(high), quantum / Math.max(
          (highValue - lowValue) / Math.max(high - low, Number.MIN_VALUE),
          Number.MIN_VALUE,
        ))
      ) {
        return { amount: high, receiveAmount: highValue };
      }
    }
    if (high - low <= sourceTolerance(high)) {
      return { amount: high, receiveAmount: highValue };
    }
    throw budgetExceeded();
  };

  const searchInterior = async (
    rawStart: number,
    rawEnd: number,
    unbounded: boolean,
  ): Promise<{ amount: number; receiveAmount: number } | undefined> => {
    let low = nextPositiveFloat(rawStart, "up");
    let high = unbounded ? undefined : nextPositiveFloat(rawEnd, "down");
    if (high !== undefined && (low > high || low === rawStart || high === rawEnd)) {
      return undefined;
    }
    if (high === undefined && low <= rawStart) return undefined;

    const lowReceive = await evaluate(low);
    if (lowReceive >= input.desiredReceiveAmount) {
      return { amount: low, receiveAmount: lowReceive };
    }

    if (high !== undefined) {
      const estimate = Math.min(high, Math.max(low, input.initialUpperAmount));
      let bracketLow = low;
      let bracketLowReceive = lowReceive;
      if (estimate >= high) {
        // The reference-rate estimate can exceed the configured source cap,
        // especially when a tier is more generous than the base rate. Probe
        // the interval's actual upper interior bound before any exponential
        // growth; it is both the strongest feasibility sample and a valid
        // upper bracket for the minimum.
        const upperReceive = await evaluate(high);
        if (upperReceive >= input.desiredReceiveAmount) {
          return refineBracket(low, lowReceive, high, upperReceive);
        }
        return undefined;
      }
      if (estimate > low && estimate < high) {
        const estimateReceive = await evaluate(estimate);
        if (estimateReceive >= input.desiredReceiveAmount) {
          return refineBracket(low, lowReceive, estimate, estimateReceive);
        }
        bracketLow = estimate;
        bracketLowReceive = estimateReceive;
      }
      for (let expansion = 0; expansion < MAX_UNBOUNDED_EXPANSIONS; expansion++) {
        const next = Math.min(high, Math.max(bracketLow * 2, bracketLow + sourceTolerance(bracketLow)));
        if (next <= bracketLow) break;
        const nextReceive = await evaluate(next);
        if (nextReceive >= input.desiredReceiveAmount) {
          return refineBracket(bracketLow, bracketLowReceive, next, nextReceive);
        }
        if (next === high) return undefined;
        bracketLow = next;
        bracketLowReceive = nextReceive;
      }
      if (bracketLow < high) throw budgetExceeded();
      return undefined;
    }

    let bracketLow = low;
    let bracketLowReceive = lowReceive;
    let upper = Math.max(low, input.initialUpperAmount);
    if (upper <= low) upper = low * 2;
    let upperReceive = await evaluate(upper);
    if (upperReceive >= input.desiredReceiveAmount) {
      return refineBracket(bracketLow, bracketLowReceive, upper, upperReceive);
    }
    for (let expansion = 0; expansion < MAX_UNBOUNDED_EXPANSIONS; expansion++) {
      bracketLow = upper;
      bracketLowReceive = upperReceive;
      const next = upper * 2;
      if (!Number.isFinite(next) || next <= upper) break;
      upper = next;
      upperReceive = await evaluate(upper);
      if (upperReceive >= input.desiredReceiveAmount) {
        return refineBracket(bracketLow, bracketLowReceive, upper, upperReceive);
      }
    }
    // Expansion exhaustion may conceal a feasible route, so it is a budget
    // failure, not a false assertion that the target is impossible.
    throw budgetExceeded();
  };

  const boundaries = [...new Set(input.tierBoundaries ?? [])]
    .filter((amount) =>
      Number.isFinite(amount) && amount > input.minAmount &&
      (input.maxAmount === undefined || amount < input.maxAmount))
    .sort((left, right) => left - right);

  let previous = input.minAmount;
  const firstReceive = await evaluate(previous);
  if (firstReceive >= input.desiredReceiveAmount) {
    return { amount: previous, receiveAmount: firstReceive };
  }

  const points = input.maxAmount === undefined
    ? boundaries
    : [...boundaries, input.maxAmount];
  for (const point of points) {
    const interior = await searchInterior(previous, point, false);
    if (interior) return interior;
    const pointReceive = await evaluate(point);
    if (pointReceive >= input.desiredReceiveAmount) {
      return { amount: point, receiveAmount: pointReceive };
    }
    previous = point;
  }

  if (input.maxAmount !== undefined) return undefined;
  return searchInterior(previous, 0, true);
}