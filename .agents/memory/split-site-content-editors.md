---
name: Split Site Content editors
description: State and save boundaries when one Site Content editor is presented as separate sections.
---

When a shared Site Content editor is split into separately navigable sections, isolate form state by section and retain the complete saved configuration for full-page previews. Before saving through an endpoint that accepts both sections, read the latest saved values for the hidden section and preserve them in the payload.

**Why:** React can reuse the same component across adjacent tab branches, leaving an unrelated page or destination draft visible. A shared settings endpoint can silently replace hidden settings with stale values, and a filtered footer preview no longer depicts the page that will actually be published.

**How to apply:** Whenever editing navigation or grouping controls around page drafts and social/trust settings, check both directions of each tab switch, unsaved form state, shared save payloads, and full-context previews.