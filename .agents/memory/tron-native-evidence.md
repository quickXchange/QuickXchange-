---
name: TRON native evidence verification
description: Fail-closed requirements for native TRX indexer records and confirmation refreshes.
---

Treat an account-indexer native record only as a candidate. Before returning evidence, bind it to the exact raw transaction and transaction-info IDs, require the matching contract-index result to be successful, and prove transaction membership in the canonical block.

**Why:** Native TRON transaction-info responses can omit `receipt.result`, while raw transactions carry success per contract index. Persisting an indexer candidate before those checks can let stale or inconsistent provider data affect financial state.

**How to apply:** Keep contract indexes in event IDs, use the corresponding raw `ret` entry, require both provider IDs to equal the evidence transaction hash, and reconstruct identity kind from the persisted monitor asset during confirmation refresh. A route's deposit provider does not replace its native blockchain identity.