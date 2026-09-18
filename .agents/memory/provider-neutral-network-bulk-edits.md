---
name: Provider-neutral network bulk edits
description: Defines which crypto network changes Bulk Edit must allow across deposit providers.
---

Bulk Edit must apply supported asset and network settings to selected rows regardless of whether their deposit provider is Manual or WhiteBIT. It must not reject ordinary network changes solely because WhiteBIT is assigned.

**Why:** Operators need one consistent bulk workflow across the catalog and explicitly rejected a WhiteBIT-specific editing restriction.

**How to apply:** Keep provider assignment and switching in API Integrations, but allow Bulk Edit to change status, customer-deposit availability, lifecycle, regions, precision, memo requirements, and fallback address/memo fields for every selected network.