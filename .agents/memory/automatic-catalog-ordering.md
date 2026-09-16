---
name: Automatic catalog ordering
description: Durable ordering and capacity rules for operator-managed catalogs and site content.
---

Operator-managed entities must not expose or persist manual numeric display or sort order. Lists use deterministic automatic ordering: enabled items first, active lifecycle items before restricted or deprecated items, then the entity's name, symbol, or code with a stable identifier tie-breaker.

**Why:** QuickXchange removed manual ordering because operators should be able to add records without assigning sequence numbers. Silent fixed caps also make valid records disappear once a catalog grows.

**How to apply:** For new or changed Admin catalogs, site links, partner/social content, and blog categories, do not add display-order fields, reorder endpoints, drag-order persistence, fixed non-paginated list caps, or frontend truncation. Keep semantic priorities, chronology, workflow sequence, pagination, and page-local visual arrays when they affect behavior rather than display order.