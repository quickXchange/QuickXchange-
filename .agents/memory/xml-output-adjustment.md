---
name: XML output adjustment
description: User-approved scope of dynamic publication percentages and canonical Convert activity.
---

Dynamic XML Percentage Adjustment applies only to publication output and must remain neutral to the external platform consuming the XML. It is not a customer price, guarantee or locked quote.

**Why:** The user explicitly requested separate Active Order % and No Active Order % for XML, while customer Convert must always use real current provider quotes.

**How to apply:** Apply the selected saved percentage after existing base feed pricing. Preserve all underlying quotes, amounts, reserves, limits, markup, provider parameters, order calculations and settlement. Default OFF; retain both percentages when OFF and leave the feed's own enable switch independent.

Only active Convert orders count, globally across the whole XML feed. Swap orders do not count. Use the canonical Convert lifecycle rather than a new status registry or inferred payment stages.

**Why:** The user selected “Active Convert orders only” and specified one percentage when an order is active and another when none are active.

**How to apply:** Consult the provider-owned Convert aggregate and its existing terminal-status definition. Never call a provider API or change an order just to select the XML percentage.
