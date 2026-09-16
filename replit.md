# Rook Exchange Desk

Rook is a crypto exchange widget for transparent manual fiat orders, crypto conversion, on/off-ramp operations, and internal order management.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Quickex V2 secrets: `QUICKEX_PUBLIC_KEY` and `QUICKEX_SECRET_KEY`; `QUICKEX_API_KEY` is retained as the legacy/provider account key indicator.
- Customer status emails use the connected Resend integration; `CUSTOMER_NOTIFICATION_FROM_EMAIL` optionally overrides the sender address.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/crypto-exchange-widget` — React/Vite public exchange, order status, admin dashboard, order queue, and CRM.
- `artifacts/api-server/src/routes/exchange.ts` — exchange, order, admin, and XML endpoints.
- `artifacts/api-server/src/lib/quickex.ts` — Quickex V2 live rates, HMAC signing, order creation, and connection checks.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract.
- `lib/db/src/schema/index.ts` — Drizzle schema for orders and CRM customers.

## Architecture decisions

- Provider calls are represented behind the exchange API so ChangeNOW, Quickex, Transak, and manual desk routing can be configured without exposing provider credentials in the browser.
- Manual fiat orders and provider-backed crypto/on-ramp orders share one operational order model so staff can filter and update them in one queue.
- The XML feed is generated from the same order records used by the admin queue to avoid divergent exports.
- Quickex credentials stay server-side; the admin Providers page exposes only configured/reachability status and never returns credential values.

## Product

The public widget calculates quotes, accepts manual or instant exchange orders, and provides a trackable receipt/status page. Operations staff can review summary metrics, filter and update orders, export XML, and search CRM customers.

## User preferences

- Use Quickxchange.net as a reference for information architecture only; keep Rook branding and original copy/assets.
- Prefer a browser-first React frontend; keep domain logic portable for a future React Native client.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before checking or using generated client/server types.
- Use the queryless Quickex `/api/v2/orders/public` endpoint for the non-destructive signed connection test; adding pagination parameters causes Quickex to reject the otherwise valid signature.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
