---
name: Workspace configuration media transfer
description: Rules for moving object-backed configuration between isolated Preview and Production storage.
---

Workspace configuration snapshots must bundle the validated bytes and hash of every active object-backed image reference. Target environments restore allowed image namespaces to the same logical object paths before committing configuration.

Removed or disabled optional media must not remain a required snapshot dependency. Prune those references, and clear an unavailable optional image reference rather than rejecting unrelated configuration records.

**Why:** Preview and Production use isolated object-storage namespaces. A database path can be valid in Preview while the same path has no bytes in Production; path-only validation blocked an otherwise valid configuration import on already-removed partner logos.

**How to apply:** Any new object-backed configuration field must be included in recursive reference discovery, validated before bundling, hash-checked on import, and treated as optional only when its consuming record can remain valid without the image.