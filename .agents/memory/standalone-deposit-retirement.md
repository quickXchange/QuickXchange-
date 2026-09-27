---
name: Standalone deposit retirement
description: Financial boundary for removing the customer account deposit product without harming historical credits or order settlement.
---

The standalone customer-account deposit product is distinct from funding an individual Swap or Convert order. Removing its customer-facing page and provisioning APIs does not authorize deletion of old account addresses, immutable ledger entries, or historical reconciliation, and does not affect order-funded deposits.

**Why:** Historical addresses can still receive funds, and past credits may carry unresolved customer balances or accounting obligations. Removing ingest or records without a balance audit could strand customer money or erase financial evidence.

**How to apply:** Keep historical settlement and recovery operational until every legacy account-only address and balance has a documented disposition. Require explicit owner approval and a staged archival/migration before retiring financial records or account-address ingestion.