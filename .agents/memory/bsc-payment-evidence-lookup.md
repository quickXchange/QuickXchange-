---
name: BSC payment evidence lookup
description: Reliable verification when public BNB Smart Chain RPC providers reject broad eth_getLogs scans.
---

Public BSC RPC endpoints can reject even topic-filtered `eth_getLogs` requests over broad ranges because of provider-specific range or archive limits. Do not treat that rejection as evidence that no transfer exists.

**Why:** Multiple public endpoints rejected broad USDT log scans with `limit exceeded`, archive-token requirements, or very small range limits, while the real transfer was present and directly verifiable.

**How to apply:** Narrowly discover the transaction through an explorer’s address token-transfer view, then independently query `eth_getTransactionReceipt`, the referenced block, the canonical block at that height, and the current head through JSON-RPC. Verify contract, indexed recipient, raw amount, successful receipt, block hash equality, timestamp boundary, and confirmations. Before configuring a recovery RPC, test both the worker’s exact one-block `eth_getLogs` filter and historical receipt/block reads; an endpoint may support one while rejecting the other.