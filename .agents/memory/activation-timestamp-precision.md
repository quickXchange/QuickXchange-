---
name: Activation timestamp precision
description: Why financial workers must compare persisted activation boundaries using database timestamp precision.
---

When a financial worker fences historical records at a persisted activation instant, compare both the record and activation timestamps in PostgreSQL at full precision during selection and immediately before applying effects. Do not repeat the strict comparison on JavaScript Date values.

**Why:** PostgreSQL retains microseconds while JavaScript Date retains milliseconds. A valid record created later within the same millisecond appears equal in JavaScript; a second in-process guard can reject it forever, stall the cursor, and prevent later records from being checked.

**How to apply:** Let SQL be authoritative for the boundary and use in-process checks only for independent frozen identity validation. Include a test where the two timestamps differ by microseconds but decode to the same JavaScript millisecond.