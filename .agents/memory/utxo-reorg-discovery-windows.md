---
name: UTXO reorg discovery windows
description: Why UTXO scans must overlap a confirmation-depth window while preserving watch-time and range boundaries.
---

UTXO monitoring must rescan a bounded confirmation-depth window, not only refresh already-known evidence or overlap the last scanned block.

**Why:** A reorganization can introduce a previously unseen payment in a replacement block. Canonical refresh detects removal of known evidence, but it cannot discover a new output unless the replacement height is scanned again.

**How to apply:** Rewind without crossing the immutable watch start, keep the total provider range bounded, make forward progress each cycle, and abort rather than advance when block hash and decoded block identity disagree.