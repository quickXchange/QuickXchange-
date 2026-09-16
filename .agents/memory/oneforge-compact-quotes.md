---
name: 1Forge compact quote fields
description: Live 1Forge quote payloads can differ from the long-form field names shown in public examples.
---

Accept both long-form quote fields (`symbol`, `price`) and compact fields (`s`, `p`) at the 1Forge boundary, while applying the same strict validation to either shape.

Also treat a successful batch response as a supported subset: 1Forge can omit unknown or unsupported requested symbols while returning valid quotes for every supported pair. Missing symbols must make only routes using those currencies unavailable, not invalidate the whole cache.

**Why:** A live authenticated `/quotes` response returned compact `p`, `a`, `b`, `s`, and `t` fields even though the documented examples used descriptive names. It also omitted synthetic enabled fiat codes from a mixed batch without returning an error.

**How to apply:** Preserve dual-shape parsing and partial-batch handling when changing the fiat-rate adapter. Keep provider payload details behind customer-neutral errors, and continue failing closed when a selected route actually requires a missing rate.