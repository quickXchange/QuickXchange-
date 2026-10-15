---
name: Drizzle correlated SELECT fragments
description: Qualification hazards in raw SQL expressions embedded in Drizzle SELECT projections.
---

Drizzle can remove table qualification from interpolated column objects inside
raw SQL SELECT fragments. In a correlated EXISTS, an inner table can then capture
the reference intended for the outer table.

**Why:** A workload selector compiled successfully but compared an inner text
network ID with an inner UUID ID, instead of the outer network ID. Other branches
could silently become tautologies.

**How to apply:** Use explicit qualified identifiers in correlated SELECT
fragments, inspect generated SQL, and exercise the actual query in a disposable
database. A TypeScript pass or pure policy test cannot verify correlation.
