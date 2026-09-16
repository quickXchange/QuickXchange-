---
name: Quickex V2 signing
description: Quickex HMAC signing works for signed orders, but its read-only connection test has an undocumented query-string edge case.
---

Use the documented Quickex V2 signature string (`timestamp + body + publicKey`) with raw-secret HMAC-SHA256 and Base64 output. For the signed connection check, call the orders endpoint without query parameters.

**Why:** Quickex accepts the queryless signed read, but rejects the same valid signature as `Invalid signature` when pagination parameters are included, despite showing query parameters in its documentation.

**How to apply:** Keep signed order bodies byte-identical between signature generation and the transmitted request. Use the queryless orders read for health checks; add query parameters only after confirming Quickex's canonical-query rules.