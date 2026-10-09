# Reusable QuickXchange integrations for QXLayer

This is the existing working implementation, not a replacement integration stack.
The Website, Telegram Mini App, API server, shared libraries, database schemas,
migrations, Admin controls and tests are included in this source snapshot.

## Integration map

| Integration | Existing implementation |
| --- | --- |
| 1Forge | `artifacts/api-server/src/lib/manual-desk-rates.ts` implements rate retrieval, configuration and rate health. Provider configuration models are in `lib/db/src/schema/provider-integrations.ts`; the existing Website Admin screen is `artifacts/crypto-exchange-widget/src/pages/admin.tsx`. |
| WhiteBIT | WhiteBIT services, recovery helpers, history workers and tests retain deposit handling, monitoring and provider fallback behavior. The API entry point is `artifacts/api-server/src/routes/whitebit.ts`; models are in `lib/db/src/schema/whitebit-deposits.ts`. `deposit-provider-registry.ts` and the existing capability/readiness logic retain the Manual provider boundary. |
| Quickex | `artifacts/api-server/src/lib/quickex.ts`, `quickex-order-service.ts` and `src/routes/quickex.ts` retain Convert quotes, Fixed/Floating behavior, exchange creation and tracking. Models are in `lib/db/src/schema/quickex-orders.ts`. Website and Mini App Convert components and existing regression tests are included. |
| Alchemy | The existing Admin blockchain configuration supports the Alchemy provider and secret-name references. The shared monitor configuration and adapters remain authoritative; provider-specific Bitcoin support and BSC log-range handling are included. There is no additional pricing or conversion implementation. |
| Other RPC providers and monitors | `artifacts/api-server/src/lib/blockchain-monitoring/` includes the existing EVM, TRON, Solana and Bitcoin adapters, HTTP transport, monitoring service and adapter registry. `src/routes/blockchain-monitoring.ts`, the Admin blockchain configuration component and `lib/db/src/schema/blockchain-monitoring.ts` preserve configuration, health and connection-test behavior. Configuration options are not a guarantee of implemented adapters: the registry rejects unsupported adapter kinds. |
| Asset/network provider selection | Existing provider capabilities, credential handling, deposit provider registry, readiness and operational-health services are retained. Asset/network models, Admin controls, provider connection tests, operator authorization and permissions remain part of the source. |
| Telegram Exchange Bot | `artifacts/api-server/src/routes/telegram.ts` and the existing Telegram services retain commands, exchange wizard, account linking, Swap/Convert creation, tracking, localization, notification outboxes and webhook validation. Telegram settings and durable delivery models are in `lib/db/src/schema/telegram*.ts`; support/news bot components and tests are included as well. |
| Telegram Mini App | The complete `artifacts/quickxchange-telegram-mini-app/` artifact includes Swap, Convert, Telegram authentication, tracking, order details, account/support screens, mobile layout, branding, shared languages and unit tests. API bindings are in `src/routes/telegram-mini-app.ts` and `telegram-connect.ts`; shared models, API client/validators and `e2e/telegram-mini-app-ui.spec.ts` are included. |

`INTEGRATIONS.json` lists reviewed files and SHA-256 checksums for these groups.
Files can appear in multiple groups because the integrations share the existing
configuration, Admin, schema and authorization architecture.

## Independent white-label customers

- Provision independent credentials and webhook secrets for every customer.
  Do not copy credentials or persisted credential/configuration records from
  QuickXchange.
- Configure branding, bot identity, URLs, asset/network availability, provider
  selection and permissions using the existing configuration and Admin controls.
- Isolate each customer's deployment and database unless QXLayer separately
  implements and verifies tenant isolation. This snapshot does not claim to add
  a multi-tenant credential store, database partitioning or cross-customer
  authorization.
- Generate webhook configuration for the customer's own deployment and bots.
  Do not reuse live QuickXchange webhooks, wallet assignments or order data.
- Run integration tests with synthetic fixtures and isolated test databases.
  Live-provider checks require that customer's explicitly configured credentials.

## Privacy and compatibility

No runtime secrets, environment files, database exports or private customer
records are included in this snapshot. Customer-specific historical recovery
inputs are omitted while preserving schema migration ordering and general
recovery code. Public blockchain contract identities and synthetic test data
remain where required by the implementation.

Existing Git history is preserved. These exclusions concern the current source
snapshot, not material already present in historical commits.

## Build and tests

Use `pnpm install --frozen-lockfile`, then `pnpm run build:production`.
The source-only lockfile keeps the existing resolved library versions.

Existing API test entry points are declared in
`artifacts/api-server/package.json`; Mini App tests are declared in its
`package.json`; browser regression suites are in `e2e/`. Some API suites mutate
database fixtures or contact providers: do not run them against a customer's
production database.

## Verification for this synchronization

- Compared the included application source with the current workspace. There
  are no newer reusable application changes since the preceding source snapshot;
  its privacy sanitization and source-only lockfile are retained.
- The frozen dependency install and full production build passed for that
  unchanged application snapshot. This update adds documentation and a
  checksummed integration inventory, not runtime changes.
- The Mini App unit suite was run in the separate source copy: **72 passed,
  8 failed**. All eight failures are logo-rendering fixtures in
  `src/components/mini-app-logo.test.ts` that render a component requiring
  `I18nProvider` without that provider. The test file matches the workspace;
  these fixtures were not changed as part of source synchronization.
- Database-mutating suites, live-provider tests and customer webhooks were not
  executed. No running application workflow or database was changed.
