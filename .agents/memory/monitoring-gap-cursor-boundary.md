---
name: Monitoring gap cursor boundary
description: Why activating a delayed blockchain watch must start from a fresh provider head rather than scanning backward.
---

Activation of a delayed or repaired blockchain watch must capture a fresh provider head and use it as the immutable start cursor. Do not silently backdate the cursor, even when an exact transfer exists after order creation.

**Why:** A funded validation encountered a genuine exact transfer sent while registration was unresolved. Backdating after seeing that transfer would weaken the proof boundary and could credit historical activity that was never covered by an active watch.

**How to apply:** Resolve the registration gap first, prove the worker advanced from the activation cursor, and accept only transfers broadcast afterward. If the product needs recovery for payments sent during a gap, implement it as an explicit operator-reviewed evidence flow rather than mutating the watch cursor.