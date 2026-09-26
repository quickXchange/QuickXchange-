---
name: Customer order detail projection
description: Data-honesty boundary for customer-facing order detail redesigns.
---

**Rule:** A customer order detail redesign may reorganize and enrich the presentation, but it must render only customer-safe order values already present in the public order contract. A "User" label can use the authenticated account identity as context, but do not claim the current account email is the order's contact email unless the order actually supplies it. Treat dynamic funding and settlement detail maps as untrusted for presentation: allowlist customer-facing fields for both display and copy, rather than excluding a known set of internal keys. Omit blank values and requested fields the contract does not provide instead of inferring or manufacturing them.

**Why:** Premium detail layouts often suggest standard fields such as fees, updated timestamps, rates, receipts, or support actions. Inventing those values or controls would turn a visual-only redesign into a misleading behavior or data-contract change. The account's current email may differ from the contact recorded on an older or claimed order. A denylist can also expose newly added internal map entries, even if the containing API response is customer-scoped.

**How to apply:** Project only explicitly reviewed customer-safe keys from optional funding and settlement maps; filter null and blank entries, preserve exact values for copy, and shorten only their visual display. Apply the same projection to direct-link views and drawers. Add actions only when an existing route or behavior supports them.