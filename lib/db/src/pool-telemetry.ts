import type pg from "pg";

export type DatabasePoolErrorCategory =
  | "physical_connection_establishment_timeout"
  | "pool_acquisition_timeout"
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
  const messages = errorMessages(error);
  if (messages.some((message) => /connection terminated due to connection timeout/i.test(message))) {
    return "physical_connection_establishment_timeout";
  }
  if (messages.some((message) => /timeout exceeded when trying to connect/i.test(message))) {
    return "pool_acquisition_timeout";
  }
  return "database_query_failure";
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