---
name: TRON indexer identity boundaries
description: Provider serialization and immutable event identity requirements for TRON indexer scans.
---

Keep canonical TRON account and token identities independent from the provider-specific encoding used in account transaction paths and query parameters. Bind every accepted TRC20 record to one exact canonical receipt log and include its immutable log index in the event identity.

**Why:** The live indexer rejected a valid `41`-prefixed contract query but accepted its Base58Check form. Its history records omit block numbers and event indexes, so trusting them alone can miss canonicality or collapse multiple same-token transfers in one transaction.

**How to apply:** Convert canonical identities only when constructing indexer requests. Recover block and receipt facts from transaction info, prove membership in the canonical block, match exact Transfer logs by contract/from/to/amount, and consume a log index only after full validation succeeds.