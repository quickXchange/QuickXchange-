---
name: Production migration entrypoint
description: How artifact deployments reliably apply ordered database migrations before serving traffic.
---

The API artifact production command must invoke the real database migrator and wait for success before starting the server. Track the actual Node migrator process directly so deployment termination reaches it; do not hide it behind a package-manager child process.

**Why:** Artifact publishing uses its own production run command. Development post-merge hooks and unrelated root scripts are not implicit production release steps, so a migration can apply in development but never reach production. A package-manager intermediary can also leave the real migrator running after startup termination.

**How to apply:** Keep migrations ordered and idempotent, fail startup on migration errors, forward signals to the active migrator or API child, and test migration failure, successful handoff, and termination in both phases.