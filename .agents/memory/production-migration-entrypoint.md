---
name: Production migration entrypoint
description: How managed artifact deployments apply targeted production data reconciliation before serving traffic.
---

On Replit managed production databases, Publish owns schema reconciliation. The API artifact startup must run only narrowly scoped, idempotent production data reconciliation and verify its exact postcondition before starting the server. Do not replay the full Drizzle history when its journal can lag behind schema already applied by Publish.

On port-probed deployment targets, bind a temporary fail-closed startup gate immediately and return HTTP 503 until migration succeeds. Release the port completely before starting the API, and never spawn another child after a shutdown signal.

**Why:** Artifact publishing uses its own production run command. Development post-merge hooks are not implicit production release steps, so required data reconciliation can apply in development but never reach production. Conversely, managed Publish can apply schema without advancing a separate Drizzle journal; replaying that journal then fails on already-existing schema before reaching the required data change. Waiting to bind the configured port can also make the platform restart the container before reconciliation completes.

**How to apply:** Keep standard-server schema migrations ordered and idempotent, but use exact transactional data reconcilers on Replit startup. Fail closed on unmet prerequisites, forward signals to the active reconciler or API child, and test gate behavior, failure, successful handoff, and termination in both phases.

For autoscaled processes, acquire a session-level advisory lock before opening a repeatable-read reconciliation transaction. A transaction-scoped lock acquired after `BEGIN` can leave a waiting process with a stale snapshot and cause a serialization failure after the first process commits. Release the session lock on the same client in `finally`.

Configuration postconditions must accept both the freshly invalidated state produced by reconciliation and an already healthy proof-backed state. Otherwise, every process restart unnecessarily clears valid health proofs and forces revalidation.