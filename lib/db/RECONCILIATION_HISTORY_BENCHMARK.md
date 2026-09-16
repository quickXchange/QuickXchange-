# Reconciliation-history query benchmark

The operator recovery drawer reads the newest 50 reconciliation attempts for one
order. The benchmark reproduces that exact filter, operator join, descending
created-time sort, and limit against 500,000 audit records. Its hot order has
200,000 records, while another 300,000 records are spread across other orders.

Run against an approved development database:

```sh
pnpm --filter @workspace/db run benchmark:reconciliation-history
```

The script creates temporary tables and rolls back its transaction, so benchmark
records do not persist. It fails unless the plan:

- scans `exchange_order_audit_logs` through the `(order_id, created_at)` b-tree;
- visits at most 1,000 audit rows to return the latest 50 matching attempts; and
- completes within 250 ms.

## Recorded development plan

Measured on 2026-08-25 with PostgreSQL's cache warm from fixture loading:

```text
Limit
└─ Nested Loop Left Join
   ├─ Index Scan Backward
   │  index: benchmark_exchange_order_audit_order_created_idx
   │  index condition: order_id = 'benchmark-hot-order'
   │  rows returned: 50
   │  rows removed by filter: 119
   └─ Materialize
      └─ Seq Scan on one-row operator fixture
```

Planning took 0.467 ms and execution took 0.138 ms. The index scan visits 169
audit rows regardless of the 500,000-row table size
because the order predicate selects one contiguous index range and the backward
scan stops as soon as the limit has 50 matching attempts. The operator join is a
single-row lookup after the bounded audit scan.

The existing index is therefore sufficient; this measurement does not justify
another operational index. If the benchmark later fails because a new index is
needed on a populated table, add it to the deployment-aware concurrent-index
operation rather than a transactional migration.