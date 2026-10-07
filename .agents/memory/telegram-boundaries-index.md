---
name: Telegram boundaries
description: Topic index for Bot and Mini App identity, delivery, wizard parity and environment boundaries.
---

- [Financial order delivery](telegram-financial-order-delivery.md) — fence chat updates and keep order creation, reconciliation and deposit delivery durable.
- [Support delivery safety](telegram-support-delivery-safety.md) — expired callback acknowledgements cannot block replies; matching webhook URLs do not attest secrets.
- [Shared identity](telegram-shared-identity.md) — link through website Clerk only; freeze ownership before create and atomically claim before storing Telegram capabilities.
- [Wizard parity](telegram-wizard-parity.md) — match Swap eligibility; [preserve canonical callback indexes](telegram-search-callback-stability.md).
- [Production data boundary](telegram-production-data-boundary.md) — live bot orders belong to production; Replit preview Admin reads a separate development database.
- [Refund omission](telegram-refund-omission.md) — Telegram never collects, displays or submits refund destinations, including from legacy saved sessions.
- [Mini App identity](telegram-mini-app-identity.md) — validate initData server-side, use short-lived sessions and attach canonical orders through tracking capabilities.
- [Mini App auth verification](telegram-mini-app-auth-testing.md) — real session bootstrap writes chat mappings; use synthetic identities and a schema-only disposable database.
- [initData signature](telegram-initdata-signature.md) — bot-token HMAC validation excludes only hash; modern signature remains in the sorted data-check-string.
