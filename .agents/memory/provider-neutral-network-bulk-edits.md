---
name: Provider-neutral network bulk edits
description: Defines which crypto network changes Bulk Edit must allow across deposit providers.
---

General Bulk Edit must apply supported asset and network settings regardless of deposit provider. Provider assignment belongs in a separate, Owner-reviewed exact-route bulk workflow; it must not be smuggled into ordinary network bulk edits or the wallet-address editor. The assignment changes no Manual Wallet Tracking or saved fallback data, and never silently enables customer deposits.

**Why:** Operators need one consistent catalog bulk workflow across providers, but financial provider switching requires exact WhiteBIT capability review and must not silently change monitoring or wallet configuration.

**How to apply:** Keep ordinary Bulk Edit provider-neutral for status, customer-deposit availability, lifecycle, regions, precision, memo requirements, and fallback address/memo. Route provider changes through the dedicated review/apply flow; only that flow may switch WhiteBIT, Manual Wallet, or None on selected exact routes.