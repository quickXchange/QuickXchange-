---
name: Crypto identity fallback
description: The project rule for resolving broken or missing cryptocurrency artwork consistently.
---

For a recognized cryptocurrency symbol, a broken provider or database logo must fall through to the centralized official asset source rather than initials or a generic mark. Use the neutral fallback only after every real source is exhausted for a genuinely unknown asset.

**Why:** Provider-supplied artwork is not always reliable, but a broken URL should not make well-known assets such as BTC or DOGE lose their recognizable identity or display a different logo style.

**How to apply:** Any new crypto surface should use the shared identity resolver, keep asset and network artwork separate, and test the broken-supplied-URL path for a known symbol before testing the unknown-asset fallback.