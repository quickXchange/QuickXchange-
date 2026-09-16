---
name: Customer dashboard financial summaries
description: Accuracy rules for customer-facing order counts and sent/received totals.
---

Customer dashboard summaries must distinguish authoritative API totals from calculations based on a bounded page of orders. Label bounded calculations with their loaded-history scope, and group sent/received amounts by asset using exact decimal arithmetic.

**Why:** The account order endpoint is paginated and sent/received amounts can span unrelated currencies. Presenting a page-local count as all-time, coercing exact decimals through floating point, or combining currencies produces a financially misleading dashboard.

**How to apply:** Use the API's total only for the overall order count. For status counts and amount totals, either load every page safely or label the bounded scope. Aggregate only comparable amounts, preserve exact decimal strings, and never collapse different asset symbols into one numeric total.