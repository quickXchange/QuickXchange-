---
name: Coinbase ticker coverage
description: A provider-coverage rule for the public live market snapshot.
---

Only show a numeric market-snapshot price when Coinbase returned a valid value for that asset. Discover current USD-market support from Coinbase’s public product catalog before requesting stats. Assets without a Coinbase USD market must be omitted from the default ticker or shown as unavailable; never substitute another provider or a static fallback.

**Why:** Coinbase does not expose every crypto asset as a public USD product. In particular, XMR returned no Coinbase market, which would otherwise leave the default ticker permanently degraded.

**How to apply:** Filter requested ticker symbols against the live Coinbase product catalog, then request stats only for supported products. Keep per-asset failure handling because supported products can still fail temporarily, and retain the last successful quote during transient refresh errors.