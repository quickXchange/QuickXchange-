---
name: Production migration entrypoint
description: How artifact deployments reliably apply ordered database migrations before serving traffic.
---

The API artifact production command must invoke the real database migrator and wait for success before starting the server. Track the actual Node migrator process directly so deployment termination reaches it; do not hide it behind a package-manager child process.

On port-probed deployment targets, bind a temporary fail-closed startup gate immediately and return HTTP 503 until migration succeeds. Release the port completely before starting the API, and never spawn another child after a shutdown signal.

**Why:** Artifact publishing uses its own production run command. Development post-merge hooks and unrelated root scripts are not implicit production release steps, so a migration can apply in development but never reach production. A package-manager intermediary can leave the real migrator running after startup termination. Waiting to bind the configured port until migrations finish can make the platform restart the container repeatedly before the migrator completes.

**How to apply:** Keep migrations ordered and idempotent, fail startup on migration errors, forward signals to the active migrator or API child, and test gate behavior, migration failure, successful handoff, and termination in both phases.