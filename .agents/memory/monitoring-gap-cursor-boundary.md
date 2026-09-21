---
name: Monitoring gap cursor boundary
description: Why activating a delayed blockchain watch must start from a fresh provider head rather than scanning backward.
---

Every blockchain watch activation, including initial order creation and delayed repair, must capture a fresh provider head and use the next block or slot as its immutable start cursor. Enforce that boundary again when attributing evidence; a scan cursor alone is not sufficient. Do not silently backdate the cursor, even when an exact transfer exists after order creation.

**Why:** Shared receiving addresses make historical exact-amount transfers ambiguous. A delayed watch could otherwise claim evidence found by another watch, and a crash between order commit and registration could leave ready funding permanently unwatched.

**How to apply:** Persist an unresolved registration marker in the same transaction as a ready Manual order, resolve it only after an immutable active watch exists, skip scans while head+1 is ahead of the chain, and match only evidence at or after each watch boundary. If the product needs recovery for payments sent during a gap, implement an explicit operator-reviewed evidence flow rather than mutating the cursor.