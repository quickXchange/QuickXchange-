---
name: TRON contract query encoding
description: Provider compatibility boundary between canonical TRON token identities and indexer query parameters.
---

Keep the canonical exact TRC20 contract identity independent from the provider-specific encoding used in account transaction query parameters. A valid `41`-prefixed hex identity can be accepted by local normalization while the live indexer rejects it as a query parameter.

**Why:** The TRON Mainnet head and native-account paths succeeded, but the TRC20 account query returned HTTP 400 when the adapter sent the stored canonical hex contract directly.

**How to apply:** Before declaring TRC20 ready, verify the provider's required contract query encoding, convert only at the adapter boundary, retain the canonical identity for evidence matching, and pass the actual project scanner against the live endpoint.