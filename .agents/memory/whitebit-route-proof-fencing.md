---
name: WhiteBIT route proof fencing
description: Durable safety rules for enabling and invalidating provider-backed customer deposit routes.
---

WhiteBIT operational verification may use a durable proof bound to the exact route configuration and active credential identity. Proof state must not determine whether an explicitly assigned, enabled Admin route appears in the You Send selector.

**Why:** Runtime funding safety and Admin-configured catalog visibility are separate concerns. Conflating them previously removed valid configured routes from the public selector.

**How to apply:** Serialize verification and credential changes with locks and version fences, but use proofs only at operational provider boundaries. Never import routes, reassign providers, or rewrite selector visibility from WhiteBIT capabilities.

Signed-credential reachability, address-creation permission, and the operator's On/Off setting are independent facts. A credential diagnostic must not change customer-facing route flags. Permission verification requires an explicitly confirmed, single real address creation for one selected route; switching the provider on must consume an existing current proof rather than make new address requests.

**Why:** WhiteBIT's reliable address-permission check is mutating. An ordinary diagnostic or toggle must not silently create addresses or change customer deposit availability.

**How to apply:** Use mocked provider responses for automated checks. Do not treat credential success or enabled state as evidence of address permission.