---
name: Scoped pnpm installs
description: How to add a runtime dependency to one artifact in this workspace.
---

Use a filtered pnpm add when installing a dependency owned by a leaf artifact, rather than relying on the generic language-package installer.

**Why:** The installer invokes an unfiltered `pnpm add` from the workspace root and fails the root-install guard; it rejects `--filter` as a package token. A direct filtered pnpm command is necessary to keep the dependency in the correct artifact instead of polluting root dependencies.

**How to apply:** After checking the package-management and pnpm-workspace guidance, target the owning artifact explicitly and verify both its package manifest and the lockfile. Avoid workspace-wide installs for leaf runtime imports.