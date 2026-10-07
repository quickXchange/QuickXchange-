---
name: Multi-artifact build routing
description: Production build verification when several path-routed web artifacts share one workspace.
---

Run production web builds per artifact with its own trailing-slash preview base path and a valid build-time port, rather than assuming one recursive workspace build has enough routing context.

**Why:** The artifact verifier resolves public assets against the configured base path. A missing port or base path stops some Vite builds; a non-trailing-slash base path can compile successfully yet fail asset verification. Different artifacts need different bases, so one shared root environment cannot represent them all.

**How to apply:** When validating a change across path-routed artifacts, build the affected artifact(s) separately under their registered preview base paths; treat the backend build separately. Do not change application routing just to make a context-free root build pass.

Final publishing validation for cross-package changes must include the exact production build entrypoint, not only selected application type checks.

**Why:** A localization change passed the Website, Mini App and API checks but publishing failed because a maintenance script's shared-library compiler boundary was never checked.

**How to apply:** Run the complete configured production build once after the coherent change set. Keep its ancillary workspace checks enabled; fix missing project dependencies rather than widening compiler boundaries or bypassing checks.