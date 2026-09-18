---
name: Settlement-option pricing wildcards
description: Matching and persistence rules for partial Any-side manual pricing routes.
---

When either side of a pricing rule uses immutable settlement-option identity, a null option ID on the other side is an authoritative wildcard. Hidden legacy asset, network, or payment-method selectors must neither constrain matching nor survive a write on that Any side.

**Why:** Older partial-wildcard rows and bulk edits could retain hidden legacy selectors, making an Admin-visible Any Source rule behave like a source-specific rule for some routes.

**How to apply:** Use the shared server resolver for Admin preview, public quotes, order revalidation, and stored quote economics. Rank exact two-option routes above partial wildcards. Canonicalize every resulting Any side during single and bulk writes, including transitions to Any/Any.