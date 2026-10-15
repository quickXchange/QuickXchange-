---
name: BSC payment evidence lookup
description: Reliable verification when public BNB Smart Chain RPC providers reject broad eth_getLogs scans.
---

Public BSC RPC endpoints can reject even topic-filtered `eth_getLogs` requests over broad ranges because of provider-specific range or archive limits. Do not treat that rejection as evidence that no transfer exists.

Some endpoints also reject exact-recipient **one-block** log reads despite
successful chain, head and block calls. Such an endpoint is not a token-monitoring
fallback. Monthly-capacity errors can also arrive as generic provider failures;
retain safe HTTP/RPC codes and quota categories, never raw error bodies or URLs.

**Why:** Head-only probes made an existing alternative appear healthy although
its required transfer-log method was unusable.

**How to apply:** Test the complete required method set before changing provider
selection. Restore quota or obtain Owner approval for a fully verified provider;
never bypass readiness fences merely to clear the health indicator.

Free public-provider probes can pass transfer logs while rejecting receipt
reads, just as other providers can pass receipts while rejecting logs. Do not
silently combine or substitute financial evidence sources to work around quota.

**Why:** A free BSC candidate accepted exact token filters but rejected multiple
valid historical receipt requests. A partial provider check cannot establish
deposit-monitoring readiness or authorize a production source change.

**How to apply:** Validate chain identity, exact-route log filters, historical
blocks, receipts and canonical membership from the target host. Require explicit
approval for provider selection changes; keep failures visible until complete
verification succeeds.

**Why:** Multiple public endpoints rejected broad USDT log scans with `limit exceeded`, archive-token requirements, or very small range limits, while the real transfer was present and directly verifiable.

**How to apply:** Narrowly discover the transaction through an explorer’s address token-transfer view, then independently query `eth_getTransactionReceipt`, the referenced block, the canonical block at that height, and the current head through JSON-RPC. Verify contract, indexed recipient, raw amount, successful receipt, block hash equality, timestamp boundary, and confirmations. Before configuring a recovery RPC, test both the worker’s exact one-block `eth_getLogs` filter and historical receipt/block reads; an endpoint may support one while rejecting the other.