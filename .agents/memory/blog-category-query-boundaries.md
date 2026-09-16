---
name: Blog category query boundaries
description: Durable rules for reactive Blog filters and safe slug-or-ID database lookups.
---

Public Blog filters must subscribe to the router's search-string state, not infer query changes from pathname state or read `window.location` without a reactive subscription.

**Why:** Query-only navigation can update the browser URL and selected control while leaving the article request and cached result unchanged.

**How to apply:** Use the router's dedicated search hook to derive request parameters and include those parameters in the query key.

When an API accepts either a category slug or UUID, only compare the input against a UUID column after validating that the input is a UUID.

**Why:** PostgreSQL casts comparison parameters to the column type before evaluating an `OR`; an ordinary slug compared to a UUID column raises an error instead of falling through to the slug match.

**How to apply:** Branch the database predicate by input shape, then apply the resolved category ID to the article query.