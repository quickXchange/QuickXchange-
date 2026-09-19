---
name: WhiteBIT route proof fencing
description: Durable safety rules for enabling and invalidating provider-backed customer deposit routes.
---

WhiteBIT-backed customer deposit availability requires a durable proof bound to the exact route configuration and active credential identity. A stored eligibility flag is never proof.

**Why:** Eligibility can otherwise survive credential rotation, capability outages, or route edits and expose a deposit route that the active provider account cannot safely receive.

**How to apply:** Serialize verification, credential changes, and catalog determinant changes with shared locks and version fences. Any global proof invalidation must atomically reconcile every route with WhiteBIT unavailable, preserving only independently valid Manual/Fallback wallets.