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

An old stored credential can shadow a different, working environment credential while its previously saved verification still looks current. A failed address request is not proof that the account lacks unique-address permission if even a signed read-only request with the active credential is rejected.

**Why:** A live route probe and a signed balance check both received definitive authorization failures from the selected stored credential, while the alternate environment credential passed the same read-only check. Persisted verification describes a past test, not current provider acceptance.

**How to apply:** Diagnose the selected credential source with a read-only signed request before attributing address failures to route permission. Switch sources only through the verified credential flow, and invalidate/re-prove exact routes before claiming live readiness. Never print keys or provider response bodies.

Do not infer a WhiteBIT deposit-network alias from a human-readable Admin network name or a saved manual fallback address. In a September 2026 public capability snapshot, BTC deposits were advertised under `BTC`, not the Admin route code `BITCOIN`; some other active routes also lacked an exact match. Treat such routes as unsupported until an explicitly reviewed identity mapping is established.

**Why:** Silently equating network names with provider identifiers would authorize deposits on an unverified route, while silently downgrading an operator's Enabled request conceals the mismatch.

**How to apply:** Compare the live, read-only provider catalog to the exact Asset + Network row before enabling; show an unsupported result in previews and reject attempted enabling without changing persisted state. Recheck live capabilities because provider catalogs can change.