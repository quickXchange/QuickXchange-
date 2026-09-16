---
name: Customer suspension boundaries
description: How account suspension must be enforced across mixed authenticated and anonymous customer routes.
---

Suspension checks must run wherever an authenticated customer identity is resolved for a side effect, not only in middleware used by customer-only APIs. Mixed routes that also allow anonymous orders need the check inside their authenticated branch.

**Why:** Some order-creation endpoints intentionally bypass customer-only middleware to preserve anonymous checkout. Updating CRM status and guarding only authenticated account pages still lets a suspended signed-in user create orders through those mixed routes.

**How to apply:** When adding a customer-facing side effect, trace every route to the point where Clerk identity and verified email become authoritative. Apply the shared active-customer guard there, while leaving the genuinely anonymous branch unchanged.