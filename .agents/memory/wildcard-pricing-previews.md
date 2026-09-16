---
name: Wildcard pricing previews
description: Defines how Any-sided manual pricing rules behave when loaded into the operator preview.
---

Loading a wildcard pricing rule for testing must preserve the wildcard side visibly instead of replacing it with a default settlement option. Clear any result from the previously tested rule, and use the concrete side for the displayed currency context when the wildcard side has no denomination.

**Why:** An Any side is part of the selected rule’s meaning, but it does not identify a concrete market route. Silently substituting a default misrepresents the rule and can leave stale asset or payment-method context visible.

**How to apply:** When an operator tests an Any-sided rule, show Any for that side, load every concrete side exactly, keep the amount editable, and require the operator to choose a concrete missing side before requesting a quote.