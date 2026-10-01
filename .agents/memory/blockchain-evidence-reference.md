---
name: Blockchain evidence reference
description: Index of chain-specific evidence, token identity, and reorg constraints.
---

- [EVM receipt scanning](evm-receipt-scan-efficiency.md) and [canonical event signatures](canonical-evm-event-signatures.md) — prefilter receipts and independently verify transfer signatures.
- [Monitoring route identity](blockchain-monitoring-route-identities.md) — native/token identity is explicit, never inferred from network family.
- [Issuer-verified bridged tokens](issuer-verified-bridged-tokens.md) — incomplete issuer proof must not become a verified deployment.
- [TRON contract queries](tron-contract-query-encoding.md) and [native transfer evidence](tron-native-evidence.md) — bind logs and transfers to canonical identities.
- [Polygon USDT0](polygon-usdt0-identity.md) — preserve the distinction from former bridged USDT.
- [Ethereum strict readiness](ethereum-strict-readiness.md) and [BSC legacy boundary](bsc-legacy-readiness-boundary.md) — native BSC exceptions do not cover BEP20 tokens.
- [UTXO reorg discovery](utxo-reorg-discovery-windows.md) — rewind bounded confirmation windows to discover replacement-chain deposits.
- [Signed crypto route identity](signed-crypto-route-identity.md) — immutable route IDs are authoritative; display labels are not.