---
name: GitHub source-only synchronization
description: Safe reusable source snapshots and GitHub App writes when local Git push authentication fails.
---

Public Git reads can succeed while local HTTPS Git pushes fail, even when the connected GitHub App has repository write permission.

**Why:** Anonymous clone and ref reads succeeded, local push authentication failed, and the connected App successfully uploaded identical Git objects and created the source branch.

**How to apply:** Use the connected App's authenticated Git data API when CLI write credentials fail. Verify blob/tree hashes, commit ancestry and the remote branch. Never extract connector credentials or rewrite history to work around authentication.

Reusable source snapshots need a fresh-build check and an audit beyond environment files: customer-specific operational recovery inputs can be embedded in otherwise valid application source.

**Why:** Excluding private attachments exposed runtime dependencies on reviewed public bank artwork, while historical recovery inputs required removal from the reusable copy.

**How to apply:** Prepare and validate a separate source copy without changing the running app or database. Keep required reviewed public artwork and general provider/monitoring logic. Omit customer-specific recovery data, retain migration ordering, and explain that preserving existing Git history does not purge earlier commits.
