---
name: Customer order detail projection
description: Data-honesty boundary for customer-facing order detail redesigns.
---

**Rule:** A customer order detail redesign may reorganize and enrich the presentation, but it must render only customer-safe values already present in the public order contract. Omit blank values and requested fields the contract does not provide instead of inferring or manufacturing them.

**Why:** Premium detail layouts often suggest standard fields such as fees, updated timestamps, rates, receipts, or support actions. Inventing those values or controls would turn a visual-only redesign into a misleading behavior or data-contract change.

**How to apply:** Treat dynamic funding and settlement maps as optional projections, filter null and blank entries, preserve exact values for copy, and shorten only their visual display. Add actions only when an existing route or behavior supports them.