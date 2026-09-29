---
name: Bulk field review snapshots
description: How to fence reviewed payment-method field edits against same-timestamp concurrent changes.
---

For reviewed bulk field edits, a timestamp match alone does not prove that the stored fields are unchanged. Bind each selected method's field-definition snapshot to the signed review and compare it again under the apply transaction's row lock.

**Why:** Two edits can share a millisecond-resolution update timestamp, allowing a timestamp-only review check to overwrite an intervening field edit despite passing a version check.

**How to apply:** Keep the requested changes, selected methods, direction-override choices, and current stored field snapshots in the same signed review boundary. A changed snapshot must require a fresh preview, even if the timestamp still matches. Preserve unrelated method fields and opaque field metadata while merging.