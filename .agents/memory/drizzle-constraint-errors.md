---
name: Drizzle constraint errors
description: Handling database uniqueness failures at API mutation boundaries.
---

PostgreSQL constraint error codes may be nested inside Drizzle's thrown query error, rather than exposed as the top-level `code`. A top-level-only uniqueness check can turn an expected duplicate-key conflict into a 500.

**Why:** An operator's duplicate add-on key reached the unique constraint, but the API missed the wrapped `23505` and reported an unhandled server error instead of an actionable conflict.

**How to apply:** At API mutation boundaries that promise a conflict response, inspect the causal error chain or use an existing nested-cause helper. Do not depend solely on the outer thrown object's `code`.