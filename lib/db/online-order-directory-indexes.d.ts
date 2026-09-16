import type { Pool, PoolClient } from "pg";

export interface OnlineOrderDirectoryIndex {
  indexName: string;
  columns: string[];
  ready: boolean;
  valid: boolean;
}

export function ensureOrderDirectoryIndexes(
  connection: Pool | PoolClient,
  options?: {
    schema?: string;
    lockTimeoutMs?: number;
    statementTimeoutMs?: number;
  },
): Promise<OnlineOrderDirectoryIndex[]>;