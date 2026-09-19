---
name: Simplified settlement field editors
description: Compatibility rules for non-technical Admin editors over advanced settlement field definitions.
---

Treat saved internal keys and hidden advanced metadata as opaque compatibility data. A simplified editor may change only the controls it exposes and must preserve everything else verbatim.

**Why:** Historical order details, signed quotes, conditional references, and widget projections can depend on existing keys and advanced properties even when owners no longer see those controls.

**How to apply:** Generate normalized collision-safe keys only for genuinely new rows at the server boundary. Keep send and receive rows directional. When one side of a legacy both-direction field changes, retain the original key for the unchanged side and create a new server-keyed row for the edited side.