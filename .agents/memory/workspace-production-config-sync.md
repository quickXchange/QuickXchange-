---
name: Workspace-to-production configuration sync
description: Durable boundary for synchronizing configuration without treating operational production data as deployable configuration.
---

Workspace development configuration is the source of truth for catalog, pricing, published site content, and built-in appearance settings. Production-only configuration is soft-disabled rather than deleted.

**Why:** Development and Production use separate databases. Republishing code does not synchronize their data, while copying a database would endanger orders, customers, transaction history, credentials, wallet assignments, and deposit state.

**How to apply:** Use an explicit Owner-only dry-run and confirmed transactional import. Preserve Production IDs where external records may reference them, remap snapshot references, append published revisions, verify object paths, and never include operational/customer/provider-secret fields. Reject known test-fixture catalog rows before export/import. After catalog writes, derive customer deposit eligibility inside the transaction from Production’s own validated receiving wallets or live provider capabilities; never copy wallet addresses or credentials from Development. Invalidate process and client catalog caches after commit.