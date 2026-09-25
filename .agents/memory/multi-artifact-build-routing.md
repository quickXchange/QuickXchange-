---
name: Multi-artifact build routing
description: Production build verification when several path-routed web artifacts share one workspace.
---

Run production web builds per artifact with its own trailing-slash preview base path and a valid build-time port, rather than assuming one recursive workspace build has enough routing context.

**Why:** The artifact verifier resolves public assets against the configured base path. A missing port or base path stops some Vite builds; a non-trailing-slash base path can compile successfully yet fail asset verification. Different artifacts need different bases, so one shared root environment cannot represent them all.

**How to apply:** When validating a change across path-routed artifacts, build the affected artifact(s) separately under their registered preview base paths; treat the backend build separately. Do not change application routing just to make a context-free root build pass.