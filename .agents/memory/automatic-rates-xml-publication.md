---
name: Automatic rates XML publication
description: User-approved replacement XML scope, method-owned settings, range fees and staging boundaries
---
The replacement rates XML includes automatic active Swap and executable Convert directions; the older Manual-only restrictions apply only to the retained legacy exporter.

**Why:** The user supplied final replacement requirements and explicitly chose one item per route with range fee steps instead of duplicate currency-pair items.

**How to apply:** Reuse canonical route availability and existing quotes. Uniform percentage fees belong in the unit output rate; differing ranges use fee steps. Fixed receiving fees must remain explicit and must not be charged twice. Do not derive actual customer quotes or order economics from the advertised XML.

Codes belong to immutable settlement methods, including the specific currency for fiat rails and the specific asset/network for crypto. Use only the user's supplied currency-code list; never guess new codes. Missing or conflicting mappings must remain pending with an explanation.

**Why:** The user wants method-level control and explicitly forbids invented rates, reserves and codes.

**How to apply:** New reserves default to the user-requested 1,000,000, but preserve existing explicit reserve amounts, including zero. Receiving-method reserves fan out to every destination route. Keep Perfect Money codes staging-only until the user separately confirms production inclusion.

Retain the existing production exporter and its settings until an Owner confirms the replacement after staging review. The replacement uses real quote-derived rates; the retained legacy XML percentage adjustment stays isolated from it.

**Why:** The user explicitly required staging-first replacement and Swap payouts consistent with the website.

**How to apply:** Never activate or publish as a side effect of previews, method edits or tests. Read-only previews cannot create orders. Never change customer pricing, deposits, settlement or provider configuration to make XML directions appear.
