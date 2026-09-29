---
name: Admin action feedback
description: Distinguishes transient Admin action outcomes from inline corrective guidance.
---

Successful and failed Admin mutations should give one consistent bottom toast per result, including actions launched inside drawers and dialogs. The progress indicator and automatic dismissal share the same lifetime. Validation errors, loading/progress states, and stale-review instructions that operators need while editing remain beside their controls.

**Why:** Action-result banners scattered across pages were inconsistent, and replacing corrective in-dialog instructions with a disappearing toast would make recovery harder. Multiple callers notifying for one operation can reset the timer and mislead operators.

**How to apply:** When adding Admin actions, emit one descriptive result notification at the owning mutation boundary and check that its parent callback does not emit a duplicate. Preserve existing requests and business behavior; do not use transient feedback as the only place for actionable form or review errors.