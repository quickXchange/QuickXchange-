import pg from "pg";

const HOT_ORDER_ROWS = 200_000;
const OTHER_ORDER_ROWS = 300_000;
const RESULT_LIMIT = 50;
const MAX_EXECUTION_MS = 250;
const MAX_AUDIT_ROWS_VISITED = 1_000;
const HOT_ORDER_ID = "benchmark-hot-order";
const OPERATOR_ID = "00000000-0000-4000-8000-000000000001";

function findPlanNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.Plans ?? []) {
    const match = findPlanNode(child, predicate);
    if (match) return match;
  }
  return undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must identify the development database to benchmark.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout = '2min'");
  await client.query(`
    CREATE TEMP TABLE benchmark_desk_operators (
      id uuid PRIMARY KEY,
      email text NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(`
    CREATE TEMP TABLE benchmark_exchange_order_audit_logs (
      id uuid PRIMARY KEY,
      order_id text NOT NULL,
      action text NOT NULL,
      actor_type text NOT NULL,
      actor_id text,
      request_id text,
      previous_version integer NOT NULL,
      next_version integer NOT NULL,
      details jsonb NOT NULL,
      created_at timestamptz NOT NULL
    ) ON COMMIT DROP
  `);
  await client.query(`
    CREATE INDEX benchmark_exchange_order_audit_order_created_idx
    ON benchmark_exchange_order_audit_logs (order_id, created_at)
  `);
  await client.query(
    `INSERT INTO benchmark_desk_operators (id, email) VALUES ($1, $2)`,
    [OPERATOR_ID, "benchmark-operator@example.invalid"],
  );
  await client.query(
    `INSERT INTO benchmark_exchange_order_audit_logs (
       id, order_id, action, actor_type, actor_id, request_id,
       previous_version, next_version, details, created_at
     )
     SELECT
       md5('hot-' || sequence)::uuid,
       $1,
       CASE sequence % 10
         WHEN 0 THEN 'order.reconciliation_accepted'
         WHEN 1 THEN 'order.reconciliation_conflict'
         WHEN 2 THEN 'order.reconciliation_provider_unavailable'
         ELSE 'order.status_updated'
       END,
       CASE WHEN sequence % 10 < 3 THEN 'operator' ELSE 'system' END,
       CASE WHEN sequence % 10 < 3 THEN $2 ELSE NULL END,
       'benchmark-hot-' || sequence,
       sequence - 1,
       sequence,
       '{}'::jsonb,
       timestamptz '2026-01-01 00:00:00+00' + sequence * interval '1 second'
     FROM generate_series(1, $3::integer) AS sequence`,
    [HOT_ORDER_ID, OPERATOR_ID, HOT_ORDER_ROWS],
  );
  await client.query(
    `INSERT INTO benchmark_exchange_order_audit_logs (
       id, order_id, action, actor_type, actor_id, request_id,
       previous_version, next_version, details, created_at
     )
     SELECT
       md5('other-' || sequence)::uuid,
       'benchmark-order-' || (sequence % 1_000),
       CASE WHEN sequence % 20 = 0
         THEN 'order.reconciliation_conflict'
         ELSE 'order.status_updated'
       END,
       CASE WHEN sequence % 20 = 0 THEN 'operator' ELSE 'system' END,
       CASE WHEN sequence % 20 = 0 THEN $1 ELSE NULL END,
       'benchmark-other-' || sequence,
       sequence - 1,
       sequence,
       '{}'::jsonb,
       timestamptz '2026-01-01 00:00:00+00' + sequence * interval '1 second'
     FROM generate_series(1, $2::integer) AS sequence`,
    [OPERATOR_ID, OTHER_ORDER_ROWS],
  );
  await client.query("ANALYZE benchmark_exchange_order_audit_logs");
  await client.query("ANALYZE benchmark_desk_operators");

  const explained = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT
       audit.id,
       audit.action,
       audit.actor_id AS operator_id,
       operator.email AS operator_email,
       audit.request_id,
       audit.created_at
     FROM benchmark_exchange_order_audit_logs AS audit
     LEFT JOIN benchmark_desk_operators AS operator
       ON audit.actor_id = operator.id::text
     WHERE audit.order_id = $1
       AND audit.actor_type = 'operator'
       AND audit.action IN (
         'order.reconciliation_accepted',
         'order.reconciliation_conflict',
         'order.reconciliation_provider_unavailable'
       )
     ORDER BY audit.created_at DESC
     LIMIT $2`,
    [HOT_ORDER_ID, RESULT_LIMIT],
  );

  const report = explained.rows[0]["QUERY PLAN"][0];
  const indexScan = findPlanNode(
    report.Plan,
    (node) =>
      node["Index Name"] === "benchmark_exchange_order_audit_order_created_idx",
  );
  if (!indexScan) {
    throw new Error("Benchmark query did not use the order-and-created-time audit index.");
  }

  const rowsRemoved =
    (indexScan["Rows Removed by Filter"] ?? 0) +
    (indexScan["Rows Removed by Index Recheck"] ?? 0);
  const rowsVisited = (indexScan["Actual Rows"] ?? 0) + rowsRemoved;
  if (rowsVisited > MAX_AUDIT_ROWS_VISITED) {
    throw new Error(
      `Benchmark visited ${rowsVisited} audit rows; expected at most ${MAX_AUDIT_ROWS_VISITED}.`,
    );
  }
  if (report["Execution Time"] > MAX_EXECUTION_MS) {
    throw new Error(
      `Benchmark took ${report["Execution Time"]}ms; expected at most ${MAX_EXECUTION_MS}ms.`,
    );
  }

  process.stdout.write(`${JSON.stringify({
    fixture: {
      totalAuditRows: HOT_ORDER_ROWS + OTHER_ORDER_ROWS,
      hotOrderRows: HOT_ORDER_ROWS,
      otherOrderRows: OTHER_ORDER_ROWS,
      resultLimit: RESULT_LIMIT,
    },
    bounds: {
      maxExecutionMs: MAX_EXECUTION_MS,
      maxAuditRowsVisited: MAX_AUDIT_ROWS_VISITED,
    },
    measured: {
      planningMs: report["Planning Time"],
      executionMs: report["Execution Time"],
      auditRowsVisited: rowsVisited,
      indexName: indexScan["Index Name"],
      indexDirection: indexScan["Scan Direction"],
      sharedHitBlocks: indexScan["Shared Hit Blocks"],
      sharedReadBlocks: indexScan["Shared Read Blocks"],
      tempHitBlocks: indexScan["Temp Hit Blocks"],
      tempReadBlocks: indexScan["Temp Read Blocks"],
    },
    plan: report.Plan,
  }, null, 2)}\n`);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end();
}