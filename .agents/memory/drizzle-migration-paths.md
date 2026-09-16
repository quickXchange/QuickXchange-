---
name: Drizzle migration paths
description: A workspace-specific Drizzle Kit path rule for reliable incremental migration generation.
---

Keep the Drizzle Kit `out` configuration package-relative rather than resolving it to an absolute path.

**Why:** The installed generator can create the initial migration with an absolute `out`, but later generation may prefix the working directory onto that absolute snapshot path and fail to load prior metadata.

**How to apply:** Run the generator from the database package and configure `out` as a relative migrations directory. Keep runtime migration paths absolute only after resolving them from the executing module.