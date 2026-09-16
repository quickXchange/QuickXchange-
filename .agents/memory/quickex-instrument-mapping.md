---
name: Quickex instrument mapping
description: Quickex uses catalog-specific network titles that may differ from names accepted by its rates endpoint.
---

Resolve Quickex routes with the canonical `networkTitle` from the instruments catalog. Native Ethereum mainnet uses `ETH`, not `ERC20`. Treat catalog records and rate-response instrument records as two schemas: rate responses may include only currency, network, slug, and precision. Exclude catalog identities that cannot satisfy the local quote API's asset and network validation before deriving selectable routes.

**Why:** The rates endpoint may accept `ERC20` for ETH, while the live instruments catalog only lists native ETH as `networkTitle: ETH`; exact catalog resolution otherwise rejects a supported route. Quickex may omit names, type, and memo metadata from instruments embedded in otherwise valid quote responses. Its live catalog can also contain one-character asset symbols that the local quote boundary rejects.

**How to apply:** Prefer catalog values over display labels or rate-endpoint aliases when mapping currencies to Quickex instruments. Validate catalog identities against the quote contract before exposing them, and validate embedded quote instruments by canonical identity before enriching them from the resolved catalog entry.