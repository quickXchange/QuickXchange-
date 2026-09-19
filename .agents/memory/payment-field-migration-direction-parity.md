---
name: Payment-field migration direction parity
description: Preserving route-direction behavior when runtime-injected customer fields become stored Admin configuration.
---

When removing runtime-injected payment fields, a migration must preserve the directions in which customers previously saw those fields. If the injected version was available on both route sides but an equivalent stored legacy definition is receive-only, widen that matched legacy definition to `both` during the one-time migration. Do not append another logical copy with a different key.

**Why:** Logical-key deduplication alone can incorrectly treat a receive-only legacy row as a complete replacement for a field that runtime injection previously exposed on send routes. The migration then looks successful while send-side Step 2 silently loses fields.

**How to apply:** Compare legacy stored direction with the removed runtime behavior for each logical alias/type group. Preserve existing objects and order, widen only matched legacy definitions needed for parity, and let Admin narrow Send/Receive explicitly after migration.