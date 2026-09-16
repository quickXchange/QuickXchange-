---
name: Provider-create idempotency
description: Safety rules for irreversible provider order creation and later reconciliation.
---

Persist a uniquely keyed creation intent containing the complete canonical request before calling an external provider. Identical races reuse that intent; payload mismatches fail with a conflict. Never attach an unresolved local intent to a provider order using addresses, amounts, routes, or time-window similarity.

**Why:** Provider creation is irreversible and transport outcomes can be ambiguous. A read-before-call flow can create duplicates under concurrency or process failure, while heuristic reconciliation can bind the wrong funded exchange.

**How to apply:** Any provider-backed create flow must acquire a durable database claim before the side effect. Reconcile only through an immutable exact provider identifier; otherwise keep the order explicitly unresolved for safe operator review.