---
name: TRON indexer identity boundaries
description: Provider serialization and immutable event identity requirements for TRON indexer scans.
---

Keep canonical TRON account and token identities independent from provider-specific encoding. Fence Mainnet with the provider-proven identity `0x2b6653dc`, and refresh exact-route proofs only after that identity matches. Bind every accepted TRC20 record to one exact canonical receipt log and include its immutable log index in the event identity.

**Why:** The live indexer rejected a valid `41`-prefixed contract query but accepted its Base58Check form. It also proves Mainnet through JSON-RPC separately from its block head. History records omit block numbers and event indexes, so trusting them alone can accept the wrong network, miss canonicality, or collapse multiple same-token transfers.

**How to apply:** Return the proven Mainnet identity from connection checks and compare it with configured identity before scanning or refreshing proofs. Convert canonical identities only for indexer requests. Recover block and receipt facts, prove canonical block membership, match exact Transfer logs by contract/from/to/amount, and consume a log index only after full validation.