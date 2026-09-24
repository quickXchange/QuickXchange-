---
name: Provider-neutral network bulk edits
description: Defines which crypto network changes Bulk Edit must allow across deposit providers.
---

General Bulk Edit must apply supported asset and network settings regardless of deposit provider. Provider assignment belongs in a separate, Owner-reviewed exact-route bulk workflow; it must not be smuggled into ordinary network bulk edits or the wallet-address editor. Assignment changes only the provider: it must not change Customer Deposits, Manual Wallet Tracking, saved fallback data, or monitoring. If Customer Deposits are on, block a provider switch until the operator turns them off using their own control.

**Why:** Operators need one consistent catalog bulk workflow across providers, but financial provider switching requires exact WhiteBIT capability review. Silently disabling Customer Deposits during assignment violates the separate control boundary; keeping them enabled across a provider switch would be unsafe.

**How to apply:** Keep ordinary Bulk Edit provider-neutral for status, customer-deposit availability, lifecycle, regions, precision, memo requirements, and fallback address/memo. Route provider changes through the dedicated Owner-reviewed flow, classified by the existing receiving-wallet permission; preview performs no write (including Admin mutation activity). Only that flow may switch WhiteBIT, Manual Wallet, or None on selected exact routes.