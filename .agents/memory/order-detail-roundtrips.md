---
name: Order detail round-trips
description: Prevent operator detail edits from erasing persisted operational fields omitted by response validation.
---

Every persisted field initialized and resubmitted by the order operations UI must be declared in the operator-visible Order contract and survive generated response validation.

**Why:** A detail response schema that omitted transaction-reference fields stripped them before they reached the UI. Saving an unrelated note would then submit empty references and erase the persisted values.

**How to apply:** When adding editable order fields, test the full load-then-save round trip with unrelated edits and confirm untouched values remain unchanged after OpenAPI code generation.