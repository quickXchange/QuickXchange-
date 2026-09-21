---
name: Drizzle migration paths
description: A workspace-specific Drizzle Kit path rule for reliable incremental migration generation.
---

Keep the Drizzle Kit `out` configuration package-relative rather than resolving it to an absolute path. Ensure every new journal `when` value is greater than the prior entry, including after generating beside manually timestamped migrations.

**Why:** The installed generator can create the initial migration with an absolute `out`, but later generation may prefix the working directory onto that absolute snapshot path and fail to load prior metadata. Drizzle also silently skips a new journal entry whose generated timestamp sorts before an already-applied migration.

**How to apply:** Run the generator from the database package and configure `out` as a relative migrations directory. Keep runtime migration paths absolute only after resolving them from the executing module. Compare the new journal timestamp with the previous entry before running migrations.