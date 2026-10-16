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

The user reuses QuickXchange integrations in QXLayer and VYNOX LAYER for white-label customers, each with independent credentials, branding and permissions.

**Why:** The user specified this reuse context for the QuickXchange source synchronization.

**How to apply:** Preserve existing working integration code and configuration boundaries. Do not describe a source export as implementing tenant isolation; customer credentials, configuration and permissions must remain independent in the consuming platform.

Recovery source and historical SQL can contain public token contract identities alongside private receiving wallets. Never classify every address in those files as private.

**Why:** Blanket address anonymization can replace a legitimate stablecoin contract and silently break the reusable monitoring configuration.

**How to apply:** Classify public chain/token identities separately, preserve their exact bytes, and validate them against the original canonical definitions after sanitizing private recovery inputs.

Fresh-install export checks need a clean database and synthetic SDK-format authentication fixtures, not the original application's credentials.

**Why:** Existing migrations can assume old operational monitor/catalog rows, and Clerk middleware can reject even unsigned test requests when its key configuration is entirely absent.

**How to apply:** Preserve schema and canonical identities while guarding old-install-only data assertions in the copy. Generate non-working reserved-domain authentication fixtures for isolated tests; never reuse live credentials.
