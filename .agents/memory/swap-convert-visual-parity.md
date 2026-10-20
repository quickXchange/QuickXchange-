---
name: Swap and Convert visual boundaries
description: Shared shell and intentional Step 2 separation for the two public exchange modes.
---

Keep the public shell, tabs, title language, gradients, and overall quality consistent across Swap and Convert. Treat their Step 2 layouts as intentional exceptions: Swap uses its compact payment-details reference layout with a balanced route card, separate reservation row, single-surface icon fields, and an in-widget action; Convert keeps its own wallet-details presentation. Do not make either mode inherit the other mode’s Step 2 class contract.

**Why:** The user later approved a dedicated compact Swap Step 2 reference and explicitly required Convert to remain unchanged. Earlier attempts to reuse Convert Step 2 classes made the two modes harder to evolve independently.

**How to apply:** Share neutral shell tokens and primitives, but scope fulfillment-step structure and responsive rules to the owning mode. Preserve all mode-specific fields and logic when changing presentation, and verify Step 1, Step 3, and the other mode remain unaffected.

**Convert Step 1 requirement:** Email belongs below You Receive, directly above the bottom-anchored Continue button, not in Step 2. Keep the shell and Continue geometry identical to Swap without moving Swap's fields.

**Why:** The user explicitly requested Step 1 email collection and no resize when switching modes, while retaining Swap unchanged.

**How to apply:** Validate the existing required email input before leaving Step 1; preserve its state through Back and mode switches and use that same value for order submission. Keep only overflow content scrollable so the email and action remain accessible.