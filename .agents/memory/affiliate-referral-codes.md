---
name: Affiliate referral code compatibility
description: Rules for shortening public affiliate codes while preserving existing links and immutable referral binding.
---

Public referral codes may use a compact representation, but every previously issued full code must remain valid for capture and manual binding. Resolve compact aliases unambiguously and fail closed on collisions.

**Why:** Referral links can remain in messages and posts for a long time. Replacing or invalidating an issued code loses legitimate attribution, while ambiguous short aliases can credit the wrong account.

**How to apply:** Preserve the stored legacy identity, accept both legacy and compact formats at server boundaries, normalize manual input, reject self-referral and conflicting attribution, and keep referrer binding immutable. After a URL code is validated, authenticated retries must send that exact normalized code explicitly; retain cookie consumption only as a fallback because mobile and proxied browsers may not preserve the capture cookie.