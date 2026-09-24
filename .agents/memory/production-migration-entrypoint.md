---
name: Production migration entrypoint
description: How managed artifact deployments apply targeted production data reconciliation before serving traffic.
---

On Replit managed production databases, Publish owns schema reconciliation. The API artifact startup must run only narrowly scoped, idempotent production data reconciliation and verify its exact postcondition before starting the server. Do not replay the full Drizzle history when its journal can lag behind schema already applied by Publish.

Treat a shorter production Drizzle history as history divergence, not proof of pending DDL, when the authoritative Publish schema diff is empty and production history is an exact prefix/subset of development. Data-only migrations still require independent postcondition checks because schema reconciliation cannot prove or apply their effects.

A publish schema diff reporting no changes does not prove that handwritten PostgreSQL CHECK-constraint changes have propagated. Compare the named constraint definition in Development and Production before relying on Publish to carry such a migration.

**Why:** A handwritten status constraint once differed between Development and Production even while the publish-time diff reported zero pending statements. A new application status could have been rejected by Production if code were published first.

**How to apply:** Preflight the exact catalog constraint and row compatibility read-only. If the diff omits a required constraint change, do not publish code that writes the new value until a supported, separately authorized schema application path is identified and verified.

On port-probed deployment targets, bind a temporary fail-closed startup gate immediately and return HTTP 503 until migration succeeds. Release the port completely before starting the API, and never spawn another child after a shutdown signal.

**Why:** Artifact publishing uses its own production run command. Development post-merge hooks are not implicit production release steps, so required data reconciliation can apply in development but never reach production. Conversely, managed Publish can apply schema without advancing a separate Drizzle journal; replaying that journal then fails on already-existing schema before reaching the required data change. Waiting to bind the configured port can also make the platform restart the container before reconciliation completes.

**How to apply:** Use the Publish schema diff to classify pending DDL, compare migration hashes to identify divergence, and inspect required data-only postconditions read-only. Keep standard-server schema migrations ordered and idempotent, but use exact transactional data reconcilers on Replit startup. Fail closed on unmet prerequisites, forward signals to the active reconciler or API child, and test gate behavior, failure, successful handoff, and termination in both phases.

For autoscaled processes, acquire a session-level advisory lock before opening a repeatable-read reconciliation transaction. A transaction-scoped lock acquired after `BEGIN` can leave a waiting process with a stale snapshot and cause a serialization failure after the first process commits. Release the session lock on the same client in `finally`.

Configuration postconditions must accept both the freshly invalidated state produced by reconciliation and an already healthy proof-backed state. Otherwise, every process restart unnecessarily clears valid health proofs and forces revalidation.

Once the exact production postcondition is already satisfied, skip replaying reconciliation SQL entirely—especially `ALTER TABLE ... IF NOT EXISTS`, which still requests an exclusive lock and can hold the startup gate at 503 beyond Autoscale's readiness deadline.