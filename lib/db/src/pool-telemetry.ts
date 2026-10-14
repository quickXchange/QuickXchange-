import type pg from "pg";

export type DatabasePoolErrorCategory =
  | "physical_connection_establishment_timeout"
  | "pool_acquisition_timeout"
  | "external_provider_failure"
  | "database_query_failure";

type PoolCounts = Pick<pg.Pool, "totalCount" | "idleCount" | "waitingCount">;

function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("message" in current && typeof current.message === "string") {
      messages.push(current.message);
    }
    current = "cause" in current ? current.cause : undefined;
  }

  if (typeof error === "string") messages.push(error);
  return messages;
}

export function classifyDatabasePoolError(error: unknown): DatabasePoolErrorCategory {
  if (error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" && error.code.startsWith("QUICKEX_")) {
    return "external_provider_failure";
  }
  const messages = errorMessages(error);
  if (messages.some((message) => /connection terminated due to connection timeout/i.test(message))) {
    return "physical_connection_establishment_timeout";
  }
  if (messages.some((message) => /timeout exceeded when trying to connect/i.test(message))) {
    return "pool_acquisition_timeout";
  }
  return "database_query_failure";
}

/** Only for acquisition, before a client is handed to a query or transaction. */
export function isTransientConnectionAcquisitionError(error: unknown): boolean {
  if (classifyDatabasePoolError(error) === "physical_connection_establishment_timeout") return true;
  const codes = new Set([
    "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE",
    "57P01", "57P02", "57P03", "08000", "08001", "08003", "08006",
  ]);
  const visited = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string" && codes.has(current.code)) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  // pg can report a socket closed during startup without an errno. This helper
  // is never applied after acquisition, where the same message is ambiguous.
  return errorMessages(error).some(message => /^Connection terminated(?: unexpectedly)?$/.test(message));
}

export function databasePoolTelemetry(
  component: string,
  error: unknown,
  counts?: PoolCounts,
) {
  return {
    processId: process.pid,
    component,
    totalCount: counts?.totalCount ?? 0,
    idleCount: counts?.idleCount ?? 0,
    waitingCount: counts?.waitingCount ?? 0,
    errorCategory: classifyDatabasePoolError(error),
  };
}