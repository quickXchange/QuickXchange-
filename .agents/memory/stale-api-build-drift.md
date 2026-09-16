---
name: Stale API build drift
description: How to distinguish a real database migration gap from an API process still running code that no longer matches the workspace.
---

When an authorization query reports a missing database column, verify that the queried field still exists in the current schema and source before changing the database. If it does not, rebuild and restart the managed API workflow first.

**Why:** A running compiled API bundle can survive workspace checkpoint or reconciliation changes and continue querying fields that the current source no longer defines. Applying a database change based only on that stale stack trace would preserve obsolete schema.

**How to apply:** Compare the failing SQL field against current schema and authorization code, restart the existing managed API workflow, then retry the same authenticated endpoint and confirm the old query disappears from fresh logs.