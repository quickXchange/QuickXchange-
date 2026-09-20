---
name: Issuer-verified bridged tokens
description: How to handle token deployments that appear on explorers or third-party lists but not on the issuer's supported-protocol list.
---

Configure a token route only when the exact mainnet contract or mint and on-chain decimals are verified by an authoritative issuer source. An explorer label or third-party asset list is not enough for an issuer-backed stablecoin route.

**Why:** Circle's official USDC list and Tether's supported-protocol page do not cover every bridged or exchange-issued deployment commonly labeled USDC or USD₮. Treating those labels as issuer verification can bind monitoring to the wrong asset.

**How to apply:** Keep the route at Missing Contract/Mint when the issuer does not verify that deployment. Add it later only with authoritative evidence for the exact network identity and decimals; do not infer it from symbol, bridge popularity, or an explorer name.