---
name: Swap quote responsiveness
description: Financial and interaction constraints for faster two-way Swap amount entry.
---

Prefer exact-input, short-lived signed quote reuse as a display-only hint while confirming a fresh quote. A cached hint must never authorize Continue or order submission. Do not extrapolate a previous effective net rate into a confirmed amount, even when improving perceived responsiveness.

**Why:** Fixed fees and amount-tier discontinuities make proportional forward or inverse arithmetic unreliable. The user explicitly requested faster frontend response without changing backend calculations, limits, fees, providers, or order logic.

**How to apply:** Keep provisional/cached displays visibly distinct from the current authoritative ticket, fence them by full quote input identity, and retain normal signed-ticket submission gates.

Input focus alone is not an amount edit. Preserve editable raw decimal text, but use numeric amount identity to avoid quote requests for formatting-only edits.

**Why:** Switching focus between You Send and You Receive used to trigger another quote before any amount changed, adding latency and overlapping work. Normalizing the visible input on every render also interferes with typing decimals.

**How to apply:** Separate the focused input from the calculation direction. Debounce actual edits, abort superseded browser requests, and synchronously fence their callbacks at the input event; effect cleanup alone leaves a pre-render race.

Telegram Mini App quote cancellation must preserve session-aware mutation error handling.

**Why:** Calling the generated fetch functions directly bypasses the mutation cache that expires Telegram sessions and clears protected cached data on HTTP 401. Cancellation must not weaken that existing authentication boundary.

**How to apply:** Pass a request-specific AbortSignal through a mutation while retaining the shared session-aware query client. Do not replace the mutation with an unobserved fetch when adding cancellation.