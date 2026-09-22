---
name: Verified funding transaction identity
description: Authority and projection rules for Manual Swap blockchain transaction IDs.
---

Manual Swap customer-facing transaction identity must come only from the order-scoped applied blockchain match and its immutable observation. Never treat an editable operational transaction reference as proof of funding.

**Why:** An editable order field can conflict with canonical evidence, and separately querying an applied match while its transaction is still uncommitted can permanently omit the TxID from an exactly-once notification.

**How to apply:** Project the verified observation through the exact matched asset-network for explorer links, suppress competing editable hashes on Manual surfaces, and pass verified evidence through the same transaction when creating exactly-once outbox payloads.