---
name: Versioned footer snapshot compatibility
description: Compatibility rule for extending immutable public footer and site-publication snapshots.
---

New fields added to the footer settings model must remain optional or defaultable at the public snapshot boundary, even when every newly created draft and publication supplies them.

**Why:** Immutable historical site-publication JSON remains readable after schema changes. Requiring a newly introduced field in the response parser can make unrelated publication actions and existing public snapshots fail validation.

**How to apply:** Add explicit values to new drafts and publications, normalize missing values while reading, and keep response-schema fields optional until old snapshots have been retired through a deliberate migration.