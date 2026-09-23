---
name: Production one-shot release jobs
description: Boundary for running explicit Production database release commands without affecting the healthy web deployment.
---

Run explicit Production database release commands through a Scheduled Deployment or Routine invoked with Run now. Do not run them during normal API startup or substitute a migration-only process for an autoscale web artifact.

**Why:** Autoscale web candidates are governed by HTTP startup checks. A migration-only process can be terminated before its database connection or transaction completes, while temporarily changing the web artifact configuration creates avoidable availability risk.

**How to apply:** First run a read-only connection preflight in the same scheduled environment, with redacted connection metadata and an immediate disconnect. Run the narrowly fenced release command only after the preflight succeeds, then verify Production read-only.

Project sessions may prepare and validate the command but do not expose a callable control to create or invoke a Scheduled Deployment. The user must create it in Publishing and select Run now; never substitute the normal web Publish action.