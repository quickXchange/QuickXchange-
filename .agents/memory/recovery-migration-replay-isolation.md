---
name: Recovery migration replay isolation
description: Why one-time blockchain evidence recoveries must be isolated from later worker startup.
---

Do not replay a chain of historical evidence-recovery scripts on every monitoring cycle. A current recovery must not depend on every older recovery remaining compatible with live immutable evidence.

**Why:** An obsolete recovery detected an immutable-evidence mismatch and threw before a newer exact recovery could execute. Because startup treated the scripts as one prerequisite, the exception stopped the monitoring cycle and left the intended order untouched.

**How to apply:** Prefer a durable migration ledger or a narrowly scoped current recovery. If historical recoveries must remain callable, isolate their execution and failure state so one stale case cannot block unrelated monitoring networks, watches, or newer reviewed evidence.