# White-label Exchange Blueprint

**Prepared:** 12 October 2026. **Purpose:** launch an isolated copy for another company, using the current working source—not a newly rebuilt exchange.

**Analysis-only deliverables:** this document and the companion [tenant-config.json](tenant-config.json). No application source, existing files, database rows, settings, environment variables, workflows or deployments were changed to create these documents. No database records or secret values were read or exported. Secret presence was checked by name only. The schema is a proposed configuration contract: **the application does not currently load tenant-config.json**.

## Contents

1. [Executive findings and launch blockers](#1-executive-findings-and-launch-blockers)
2. [Architecture and data flows](#2-architecture-and-data-flows)
3. [Features and pages](#3-features-and-pages)
4. [CORE versus CUSTOMIZABLE](#4-core-versus-customizable)
5. [Hardcoded identity and configuration audit](#5-hardcoded-identity-and-configuration-audit)
6. [Tenant configuration schema](#6-tenant-configuration-schema)
7. [Environment variables and secret ownership](#7-environment-variables-and-secret-ownership)
8. [New-company launch checklist](#8-new-company-launch-checklist)
9. [Audit coverage and limitations](#9-audit-coverage-and-limitations)
10. Appendices: individual hardcoded values, bundled assets, backend routes, canonical catalogs/legal copy and configurable model fields.

## 1. Executive findings and launch blockers

### Isolation model

The source is reusable, but the running product is **not a multi-tenant SaaS implementation**. Many configuration tables are singletons keyed by global/default/1; business records are not consistently partitioned by a tenant ID. Reuse this code with **one independently configured deployment, database, storage namespace, Clerk authentication setup, provider accounts and Telegram bots per client**. A hostname lookup plus a JSON file is not sufficient to isolate customers, funds, admin permissions, background workers or provider credentials. Shared hosting would require a separate, explicitly approved tenancy project.

### Must resolve before another company goes live

| Finding | Evidence | Required launch action |
|---|---|---|
| Hardcoded company identity survives Admin logo changes | Website index.html:6–46; App.tsx:1115; invoice-pdf.ts:95–96,265–266; Telegram routes:1784–1798; individual entries below | Replace identity in the new copy across HTML, translations, bot profile, emails, invoice and artwork. Admin branding alone is not comprehensive. |
| Quickex partner attribution belongs to the original company | artifacts/api-server/src/lib/quickex.ts:20,1230–1232, hardcoded aff_35637 | Obtain the new company's approved attribution arrangement. Do not launch with the original partner/referral identifier without agreement. Preserve provider pricing logic. |
| An empty database can be populated with demonstration customers/orders | artifacts/api-server/src/routes/exchange.ts:382 onward; calls at 2464,3377,3923,4819,4903,9021 | Review and disable/restrict this behavior **in the future client copy before launch**. Merely deleting demo rows is insufficient if the initializer runs again. This audit did not modify it or copy demonstration records. ChangeNOW/Transak labels inside that seed are not evidence of a functioning live integration. |
| Contact recipient and test webhook are hardcoded | contact-support-email.ts:70–80; notification-settings.ts:21,47,64 | Configure a new company support inbox and webhook; updating only an environment sender does not update a literal recipient or webhook expectation. Exact references are indexed below. |
| Some embedded artwork and static SEO bypass database settings | public/brand/*, static favicons, robots.txt, sitemap.xml, index.html | Replace original-company artwork and every canonical/share/structured-data domain in the new copy. |
| Existing policies contain company-specific and potentially inappropriate legal claims | artifacts/crypto-exchange-widget/src/lib/legal-page-content.ts; published Site Content | Have counsel review all claims, privacy wording, jurisdiction, retention, AML/KYC and consumer obligations. Never reuse legal text solely by replacing the company name. |
| No implemented automatic KYC vendor integration was found | Runtime source search; legal/UI language is not verification integration | Determine actual legal requirements and manual or integrated verification process. The proposed kycProvider field is planning metadata, not an existing working adapter. |
| Source documentation has stale descriptions | replit.md names Rook, an old API port and older provider/order/XML architecture | Use executable source/manifests and this analysis as authority. Do not launch using those old claims or copy its brand narrative. |

**Financial launch rule:** enable no executable route until its asset/network identity, provider permissions or manual wallet readiness, limits, truthful reserve and settlement instructions have been verified for the new company. Defaults or example values are not evidence of liquidity.

## 2. Architecture and data flows

### Components

| Component | Stack / responsibility | Key source |
|---|---|---|
| Website + Customer + Admin | React, TypeScript, Vite, Wouter, TanStack React Query, Tailwind/theme CSS, Clerk React components; a single routed web artifact | artifacts/crypto-exchange-widget/src/App.tsx; package.json; vite.config.ts; server.mjs |
| Telegram Mini App | Separate React/Vite artifact, mobile UI, Telegram initData authentication and server session, shared translation/amount/payment-logo libraries | artifacts/quickxchange-telegram-mini-app/src/App.tsx; src/lib/auth.tsx; src/pages/exchange.tsx |
| API server | Node 24, Express 5, TypeScript; esbuild server bundle; validation and domain services | artifacts/api-server/src/app.ts; src/index.ts; src/routes/index.ts |
| API contracts | OpenAPI source → Orval-generated React Query client and Zod validators; do not hand-edit generated contracts | lib/api-spec/openapi.yaml; lib/api-spec/orval.config.ts; lib/api-client-react; lib/api-zod |
| Database | PostgreSQL, Drizzle schema/migrations; restricted quickex_app_runtime role, separate owner migration connection | lib/db/src/schema; lib/db/runtime-database-config.mjs; lib/db/migrate.mjs |
| Shared UI/business helpers | Seven-language runtime, exact/human amount formatting, payment-logo identity and fitting | lib/i18n; lib/amount-format; lib/payment-logo |
| Media | Verified uploads, private draft media, publication snapshots and public image delivery; Replit App Storage or GCS backend | artifacts/api-server/src/lib/object-storage.ts; site-content.ts; landing-background.ts |
| Canvas | mockup-sandbox is a design/reference artifact, not the customer-facing exchange or financial backend | artifacts/mockup-sandbox; do not launch it as a public exchange dependency |
| Build/release | pnpm workspace orchestration, clean production builds, artifact-specific base paths, build identity and health probes | scripts/production-build.mjs; scripts/verify-web-build.mjs; scripts/production-api-start.mjs |

### Routing

Current manifests mount the Website at / (web port 19375), API at /api plus /whiteBIT-verification (port 8080), and Mini App at /telegram-mini-app/ (port 24368 in development; static assets in production). These are service ports, not public domain ports. API routes are composed under /api in src/app.ts; the Quickex router adds /quickex. Use the appropriate artifact/base path in browser requests; do not hardcode localhost in client code. The Website production server and Mini App production artifact are not interchangeable builds.

### External connections

| Service | Actual current use | Client ownership / caveat |
|---|---|---|
| Clerk | Website authentication, verified identity, customer session, operator authorization and mandatory Admin TOTP proof; Clerk API proxy | Independently provision/authenticate each company. This workspace reports Replit-managed Clerk; Development and Production user stores are separate. Do not copy original users/operator IDs. |
| Quickex V2 | Executable crypto routes, Fixed/Floating quotes, signed quote tickets, exchange creation and order tracking/reconciliation | Unique company credentials, approved referral attribution, connection proof and allowed permissions. Catalog visibility alone is not executable order permission. |
| WhiteBIT | Crypto catalog mappings, deposit capabilities, order-owned deposit addresses, signed webhook/history monitoring and funding evidence; manual fallback where explicitly permitted | Unique company account/keys, verified exact-route mapping and permissions. Never copy deposit addresses, balances, ledger entries, nonce/checkpoints or old verification proofs. |
| 1Forge | Fiat market/reference rates for Manual Swap pricing | Company subscription/key; schema supports API settings/connection testing. Review plan coverage and licensing. |
| Coinbase and Kraken | Crypto USD reference/ticker sources used by Manual pricing helpers, including Kraken XMR path | Existing supported reference sources, not settlement providers or guaranteed availability for every asset. |
| Blockchain RPC providers including Alchemy | Read-only chain monitoring adapters: EVM, Bitcoin, TRON and Solana; configured endpoint secret references and chain identity | Unique credentials/quotas per company, actual supported network identity and readiness. Alchemy is an RPC vendor configuration, not a duplicate exchange engine. |
| Resend | Customer/Admin transactional messages, contact delivery and newsletter delivery | New verified sender domain and credentials/connector ownership. Review all hardcoded from/recipient/domain wording. |
| Telegram Bot API | Exchange commands/wizard, linking, order tracking and Admin notifications; separate support bot and news bot pipelines | New bots, webhook secrets, channels and Mini App registration. Do not reuse an original token or webhook destination. |
| OpenAI through Replit AI integration | Editorial/blog generation and associated automation | Independent billing/access and editorial approval; optional for exchange operation. Generated copy must be reviewed. |
| Google Fonts / provider image sources / Brandfetch | Typography, known-asset/logo lookup and optional logo retrieval | Brand-specific font decisions and licensing; official coin/rail artwork must retain canonical identities. Do not expose server secrets in VITE variables. |

### Financial flows (CORE)

1. **Manual Swap:** public settlement options → existing route/pricing engine → amount/fee/limit and optional add-on calculation → signed quote → validated order creation → frozen payment-field/funding snapshots → order-specific bank/deposit instructions → operator/verified monitoring settlement progression → canonical customer status and fenced notifications. Fees and rules are client settings; calculation, precision, signing and settlement invariants remain CORE.
2. **Convert:** exact executable asset-network route → Quickex Fixed/Floating quote → signed ticket/quote integrity → idempotent provider exchange create → frozen source/deposit amount and provider order → tracking/reconciliation → canonical Convert status/outboxes. Provider Convert is independent of Manual blockchain monitoring and WhiteBIT funding.
3. **Manual/WhiteBIT monitoring:** configured exact chain/asset identity + wallet/provider proof → fresh readiness → watch/history claim with lease fencing → immutable evidence and canonical funding application → payment-backed notifications. Chain credentials, addresses and scan cursors are not reusable client data.
4. **XML:** /api/rates.xml uses canonical publication quote helpers, mappings, limits, reserves and fee-range representation. Last-successful *public* items are cached persistently for slow/failed refreshes, fenced by current configuration. XML is advisory; actual customer orders use live signed pricing. The dedicated Rates XML Admin page was removed, but method-level mapping controls and configuration-backed APIs remain. Do not revive deleted BestChange/dynamic-percentage architectures.
5. **Editorial/media:** Admin draft → verified media/content → read-only preview → approved immutable publication snapshot → cache-revalidated public rendering. Blog/newsletter scheduling and delivery are separate from financial processing.

### Database boundaries

Manual operational orders/customers and Quickex orders use distinct persisted structures, with union/projection services for operator/customer views. The database also contains asset/payment catalogs, pricing, site content, language configuration, provider credential ciphertext, operator roles, affiliate accounting, monitoring observations/watches, Telegram sessions/updates and several durable outboxes.

Configuration tables and columns are listed later. All 94 discovered pgTable declarations are indexed in Appendix F. Their structures can be reused; **their live rows cannot automatically be copied**. Orders, customers, balances/ledgers, address allocations, sessions, subscribers, contact messages, private content, audit identities, outbox deliveries, leases, cursors and provider proofs belong to the original company.

SESSION_SECRET derives signing/encryption material for persisted provider credentials (provider-credentials.ts:127 onward). Copying encrypted provider rows into a deployment with a different key is not a supported credential migration; install fresh credentials and connection proofs instead. The restricted DB role name is an internal implementation label, not necessarily a brand field when each company has an independent database.

## 3. Features and pages

### Public Website

| Path | Purpose |
|---|---|
| / | Branded landing page, Swap/Convert widget, popular routes, partners/social/trust footer and configurable public content. |
| /swap | Manual fiat↔crypto/fiat settlement flow with amount/receive-target input, live signed quote, route/payment fields, add-ons and order creation. |
| /convert | Fixed/Floating crypto conversion, exact asset-network selection, live quote and provider order creation. |
| /market-rates | Reference/market rates presentation, not a settlement guarantee. |
| /crypto-pairs | Executable crypto route discovery/shortcuts; no invented provider route coverage. |
| /operations | Published operational/company information page. |
| /how-it-works | Exchange explanations and flow guides. |
| /user-manual | Existing beginner guide, numbered tutorials, branded illustrations and navigation. |
| /about | Company information; /about-us redirects here. |
| /affiliates | Public affiliate-program information; /affiliate-program redirects here. |
| /contact | Company support/contact submission; /contact-us redirects here. |
| /privacy, /terms, /aml-kyc | Published policies with source fallback copy; require company legal review. |
| /blog, /blog/:slug | Article directory, categories/search UI, detail content, cover and SEO metadata. |
| /faq | Common questions/help; translation and support destinations. |
| /order/:id | Created order confirmation, frozen exact instructions/QR, token-gated details and tracking actions. |
| /status | Order-ID/link tracking, canonical status/timeline and verified funding projection. |
| /sign-in/*, /sign-up/* | Clerk login/registration, verified-email experience and localized auth UI. |
| /telegram/connect | Secure customer Telegram account linking. |
| Unmatched path | Not-found handling. |

Public pages managed by Site Content are registered in artifacts/crypto-exchange-widget/src/lib/public-page-registry.ts:15–31. Order/auth/account/Admin routes are declared in App.tsx:2707–2762. Links must remain consistent if a new company changes path prefixes.

### Customer account

| Path | Purpose |
|---|---|
| /account | Customer overview and scoped order summaries. |
| /account/orders | Owned Swap/Convert history with filters/pagination and precise amounts. |
| /account/orders/:id | Customer-safe order details, saved payment fields, timeline/instructions; completed-order invoice/receipt actions. |
| /account/settings | Profile/security/language and notification preferences supported by current account/auth architecture. |
| /account/affiliate | Referral link/code, eligible events, commission/balance/payout views; immutable attribution/accounting. |

There is no supported instruction here to recreate the retired standalone customer deposit panel. Historical WhiteBIT addresses and funding remain operational history, not a client template.

### Admin

| Path | Purpose |
|---|---|
| /admin | Overview, financial/operational summaries and charts. |
| /admin/orders/:id? | Manual and provider order queue/detail, source channel, assignment, status actions, support metadata, archive/bulk review. |
| /admin/revenue | Revenue/fee summaries with exact underlying amounts. |
| /admin/customers; /admin/customers/:id | Customer directory and profile/history; suspension/control paths where authorized. |
| /admin/affiliates; /admin/affiliates/:id | Affiliate directory, referral/accounting details and operator review. |
| /admin/payouts | Affiliate payout processing/review. |
| /admin/affiliate-settings | Program/provider eligibility, commission caps/minimums and cookie settings. |
| /admin/providers; /admin/integrations | Providers/API Integration controls and compatibility entry point, credentials, verification/connection tests, route provider choice and operational health. |
| /admin/notification-settings | Owner-controlled channel/event policies, verified delivery tests, branded templates and Admin Telegram linking. |
| /admin/currencies | Crypto assets/networks, fiat currencies, banks/payment rails, logos/flags, directional fields, wallet/provider/readiness/reserve/limit controls and XML code metadata. |
| /admin/pricing | Manual exact/wildcard/asset routes, markup/customer-benefit direction, fixed fees, ranges, limits, preview and fenced bulk changes. |
| /admin/swap-addons | Optional add-ons and separate exchange-fee configuration. |
| /admin/appearance | Uploaded light/dark/mobile logos, favicon and logo geometry. |
| /admin/languages | Shared enabled languages, fallback and translation overrides for Website/Mini App. |
| /admin/landing-background | Built-in/custom visual background, focal positioning, effects, placements and preview. |
| /admin/team; /admin/staff | Members, granular roles, permissions, TOTP/access controls and activity; legacy staff path redirects. |
| /admin/site-content | Page drafts/publishing, navigation, partner logos, social/trust artwork and footer presentation. |
| /admin/blog; /admin/blog/new; /admin/blog/edit/:id | Article management/editor, categories/covers/SEO and publishing. |
| /admin/blog/automation | Source/topic policy, generation/review queue, schedule/timezone and editorial settings. |
| /admin/newsletter | Subscriber management and delivery/campaign visibility; subscribers are private and must not be copied. |
| /admin/telegram/support-bot | Separate approved FAQ support bot, categories/locales and settings/webhook health; no financial lookup pipeline. |

Admin routes are permission-gated and many sensitive operations remain Owner-only. Workspace→Production configuration preview/apply exists within the existing integration/settings architecture; it is **not** a multi-company cloning function. The dedicated /admin/rates-xml page is absent by design.

### Telegram Mini App

Mounted under /telegram-mini-app/. Routes in its src/App.tsx: / (home), /exchange (Swap + Fixed/Floating Convert), /orders (history), /orders/:id (detail), /track (tracking), /support, /account and a not-found screen. Includes Telegram initData verification/session expiry, mobile selectors/search, network/logo identity, branded theme/header/navigation, language persistence, exact deposit instructions/QR and safe idempotent recovery. Website Clerk login is not substituted for its Telegram session protocol.

### Telegram bots and background features

- Exchange Bot: start/menu, Swap/Convert wizard, required payment fields, optional refund handling/add-ons, signed quotes, one idempotent order creation, one Convert creation response + QR, tracking, owned orders/account, linking/sign-out/languages/support and Mini App launch.
- Separate Support Bot: approved multilingual FAQ/categories/welcome/contact support, authenticated webhook/update dedupe and durable delivery; not a customer/order database query bot.
- News Bot: approved published-blog channel delivery, independent token/channel and retries.
- Workers: canonical Convert reconciliation, Manual/customer status delivery, WhiteBIT history monitoring, blockchain monitoring, blog scheduler, newsletter delivery, Telegram exchange/news/support outboxes and configured notification recovery. Worker entry points are visible in artifacts/api-server/src/index.ts:1–15,66 onward.
- Security/operations: deny-by-default Admin policy, verified operator identity/TOTP, credential encryption and rotation proofs, quote signing, order idempotency, customer suspension checks, frozen provenance, verified media, leases/fencing, audit trails, build/health endpoints and isolated tests.

## 4. CORE versus CUSTOMIZABLE

| Area | CORE: retain for every client | CUSTOMIZABLE: independently review/configure |
|---|---|---|
| Deployment | Routing/base-path integrity, build verification, graceful shutdown, migration discipline | Origins/domains, ports in host configuration, database/storage namespaces, runtime keys, release identity and allowed origins. |
| Branding/UI | Accessible components, responsive layout behavior, logo fitting/transparency, theme switching, page contracts | Names/logos/icons, theme palette/gradients/fonts, imagery, approved marketing copy and page visibility/navigation. |
| Localization | One shared existing translation runtime/fallback/persistence | Enabled supported languages, fallback, overrides and company-specific translated copy. Website/Mini App support en/fr/de/ru/es/ko/uk, no Arabic/RTL; Support Bot separately contains ar. |
| Catalogs | Canonical symbols, chain IDs/network codes, exact asset-network identities, official provider identities and validation | Which assets/networks/fiat/methods are enabled; operator-owned media, supported country/region policy, direction permissions and payment-field configuration. Do not rebrand BTC/USDT or alter canonical chain identities. |
| Pricing | Exact-decimal calculation, signed quote authority, amount inversion/fees/ranges and revalidation | Manual route selection/rates/markups/fixed fees/limits/tiers/add-ons, default pairs, truthful reserves, provider commercial settings. |
| Convert | Existing executable-route resolver, Quickex signing/quotes/create/tracking/frozen amount | Company credentials/account permissions/referral arrangement; supported exact routes and default pair. Replacing Quickex requires a future adapter, not merely renaming a URL. |
| Deposits/monitoring | Frozen funding route/identity, immutable evidence, readiness, confirmations, reorg/lease/cursor fencing | Company wallets, provider source, exact network endpoints, token identities, confirmation/finality/polling policy after chain validation, explicit manual fallback consent. Never transfer original proofs/cursors. |
| Orders | Immutable attribution/source, ownership/idempotency/status/lifecycle/customer-safe projections | Company payment instructions and operational staffing. **No old order/customer rows become configuration.** |
| Auth/permissions | Clerk session verification, Telegram signature validation, Admin TOTP and Owner-only boundaries | New auth tenant/branding, new staff/roles/permissions, sign-in-provider choices, owner addresses and independent signing secrets. |
| Notifications | Durable outboxes/retries, event/proof gating, unsubscribe terminal behavior | Verified sender/contact/review destinations, event/channel toggles, templates, bot identity and recipient/channel registrations. |
| Affiliates | Immutable ledger/events/reversal rules and frozen referral provenance | Program enablement, provider eligibility, commission/minimum/cap/cookie policy and commercial text. |
| Editorial/content | Draft/preview/publication safety, verified media, schedule slot claims and sanitization | Site/FAQ/legal/blog content, categories/topics/sources, covers, SEO, schedule/timezone, newsletter sender and approved support FAQ. |
| XML | Existing serializer/decimal/range logic, canonical quote projection, configuration-fenced last-good publication | Official fiat/method mappings, exact supported crypto identity, reserves/limits and enabled directions. Never use adjusted/public XML as an order quote. |

Provider endpoints, coin metadata and public logo URLs may be hardcoded but are not automatically company branding. Internal rook:/quickex_app_runtime lock/key/table identifiers are compatibility details; renaming them indiscriminately could break locking/migrations and is not necessary with isolated databases. Canonical code CSV/embedded mappings are CORE reference data, while client route availability is CUSTOMIZABLE.

## 5. Hardcoded identity and configuration audit

Appendix A lists 4,565 grouped values with all captured line locations across the runtime/migration/static-source scan. It covers explicit brand text, SEO, emails, referral attribution, logo/font references, CSS palette/gradients, source legal copy, URLs and seed entry points. Appendix D expands catalog identities and legal clauses. This is not a claim that every JavaScript string is a tenant field: generic UI text, status names and financial algorithms are CORE.

### Priority customization surfaces

1. Website index.html: static title/description/keywords, canonical/OpenGraph/Twitter, Organization/WebSite/WebApplication JSON-LD and icon links. robots.txt/sitemap.xml: original origin.
2. Website App.tsx: document title and logo fallback path; Mini App mini-app-logo.tsx: text/alt fallback; bundled logo/favicons and tutorial assets.
3. invoice-pdf.ts: PDF metadata, fixed typography/colors, thank-you/company/domain text.
4. customer-status-notifications.ts, notification-settings.ts, contact-support-email.ts, newsletter.ts: default subjects/footer/sender/contact destinations/HTML identity. Stored emailTemplates are also client settings but do not cover every literal.
5. telegram.ts, telegram-localization.ts, telegram-support-bot.ts and related news/link helpers: command/profile/welcome/notification copy, supported-bot defaults, public URLs and original identity. Brand text exists in translated dictionaries as well as English source.
6. quickex.ts: commercial referral identifier, provider base URL/timeout defaults and zero additional provider markup policy. These are not an invitation to change signed pricing during a branding task.
7. global-payment-catalog.ts, fiat/manual/payment helpers and historical migrations: reference coin/network/method coverage, initializer choices, numeric/configuration defaults. Catalog entries are not proof they are enabled or executable in the new company's Admin configuration.
8. website and Mini App CSS, invoice/editorial cover/inline styles: numerous fixed palette/gradient/font declarations. Appearance currently controls artwork geometry, not a universal tenant token loader.
9. legal-page-content.ts and public information content: policy wording, support-hours/marketing assertions and default page body/SEO. Some live published content can override these literals; the audit does not inspect private/live database content.

### Hardcoded versus persisted

Logo paths uploaded in Admin, published page bodies, configured reserves, fee rules, settlement wallet addresses, API credentials, enabled pairs and operator contacts are often stored in DB—not hardcoded. Do not mistake a literal default for today's production value. No production/customer database query was performed for this blueprint, so it deliberately does not assert current live balances, selected routes, fees, wallet addresses or published legal text.

Payment-method reserve has a legacy database default of 1,000,000 (lib/db/src/schema/payment-methods.ts:106); this is **not verified liquidity**. The proposed new-client schema safely recommends zero/OFF until a truthful reserve is configured. Affiliate settings also have legacy commercial defaults; use the cited source values only for analysis, not automatic commercial adoption.

## 6. Tenant configuration schema

Companion file: **tenant-config.json**. It is a JSON Schema draft 2020-12 document, not filled tenant data. Every documented customizable root/model property has a type or structured schema, required/optional metadata, default annotation and example. Financial decimals use strings. References to secrets contain environment-variable names only; no API key, token, credential-bearing URL, customer identity, account number or wallet address is supplied.

### Root groups

| Group | Purpose / connection to existing implementation |
|---|---|
| tenantId | Stable client deployment identifier; does not magically add DB tenant isolation. |
| brand | Display/legal names, copy, light/dark/mobile/favicon/app icons and theme tokens/gradients/fonts. Existing artwork controls are persisted; universal token/name loading would require a future adapter/refactor. |
| domains | Website/API/Mini App origins, base paths, CORS, Clerk proxy, sitemap/robots. Map to existing manifests/build/env and remove literal domains in the client copy. |
| contact | Verified public support/email/social/review destinations; distinct sender/contact-form recipient. |
| seo | Static/dynamic metadata, canonical, OG/Twitter/JSON-LD and per-page approval. |
| content | Published page/FAQ/legal/tutorial/email/bot/invoice branding content. Reuse existing Site Content/translation/template contracts, not a second renderer. |
| languages | Shared enabled supported languages/fallback/overrides; separate Support Bot locale policy. |
| providers | Company credentials by secret reference, provider endpoints where supported, account permissions/referral policy and RPC configuration. Provider objects are planning data; not every generic option is currently exposed for every provider. |
| compliance | Reviewed jurisdiction/licenses/retention/KYC policy. KYC vendor selection is explicitly future/manual metadata, not an implemented automatic vendor feature. |
| operatorPolicy | New Owner/roles/permission policy; preserve Admin TOTP and Owner-only boundaries. |
| telegram | Distinct company Exchange/Support/News bot references, profile, callbacks and Mini App registration. |
| deployment | Isolated data/auth/storage/key references and reviewed host/feature operating policy. |
| existingAdminConfiguration | 265 customizable persisted model fields across 27 table contracts; exact source references/defaults and required metadata are included. |

### Usage and defaults

- Required properties are described by standard required arrays. x-required is a convenience annotation; x-required-in-existing-db describes persistence, which is distinct from a portable configuration import requirement.
- default/examples are **documentation annotations**, not implemented initialization code. Some structured objects are intentionally empty examples and are not a launch-ready complete instance. A real instance must be populated, validated and reviewed; JSON Schema does not itself configure this application.
- x-existing-default records observed schema defaults; null means no evaluated literal default. This does not mean today's DB row is null. Safe new-client defaults deliberately disable financial/provider/editorial features and advertise no liquidity.
- x-source supplies file:line provenance. Unknown/free-form content retains existing contract extensibility; nested reusable types are in $defs.
- Create company-specific catalog IDs and references consistently. UUIDs, object paths and foreign keys must be generated/validated by a future importer or existing Admin—not copied from customer rows or the original financial operation.
- Bank details/wallet addresses are configurable operational fields but are deliberately blank/null here. Enter the new company's values through secure Owner/Admin configuration; never import original values into a new company.
- The schema excludes managed timestamps, proof fingerprints, leases/cursors, historical provider allocations, ciphertext and operational history. It includes configuration identities needed for relationships, not permission to copy original rows.
- There is no adapter loading this schema. Launch today requires supported Admin configuration + environment/manifests + a reviewed branding adaptation of the new copy. A future importer must call the existing validation/configuration boundaries and must not fork pricing/status/order logic.

The full existing-field map is in Appendix E, with type, required/default guidance and exact source location.

## 7. Environment variables and secret ownership

Only names and safe operational descriptions are included below. Secret existence was queried using a names-only mechanism. A present secret is not proof the related provider is enabled, healthy or licensed.

### Required baseline

- DATABASE_URL: independent PostgreSQL owner/connection source; APP_DATABASE_PASSWORD: independent restricted runtime-role password unless an expressly approved owner-only migration/test mode is used.
- PORT: each running service's manifest port; NODE_ENV: production for live services; artifact BASE_PATH and frontend BASE_URL must agree.
- SESSION_SECRET: unique per company/environment; CLERK_PUBLISHABLE_KEY server public key; CLERK_SECRET_KEY required in production; VITE_CLERK_PUBLISHABLE_KEY for appropriate frontend auth builds.
- PRIVATE_OBJECT_DIR and OBJECT_STORAGE_BACKEND are explicitly required by API startup. Backend is replit or gcs; GCS additionally requires GCS_PROJECT_ID and OBJECT_STORAGE_UPLOAD_ORIGINS. Public/bucket search references depend on the chosen storage configuration.
- Providers/bots/email/AI/RPC credentials are conditional on enabling those features. Required-for-feature is not required-for-process-start.

### Ownership classification

**Per-client by default:** all credentials, databases, signing/encryption secrets, auth tenant references, wallets/provider account settings, uploaded-media namespaces, public domains, email senders/recipients, bot usernames/channels/webhooks and owner bootstrap addresses. Technical tuning values can use the same *value* across clients but are deployed independently.

**Potentially shared CORE defaults, never automatically shared credentials:** official public API base URLs, canonical catalog/network IDs, protocol conventions, supported locale set and technical constants. Hosting-provided build/port/domain identifiers are platform-managed per deployment, not another client's secret.

**Recovery/test/migration flags:** do not treat them as customer/product configuration or copy an original recovery request. OWNER database bypass, one-shot migrations, notification recovery selectors, WhiteBIT historical approval and test failure flags require deliberate context-specific use, not permanent live defaults.

### Complete discovered name/reference inventory


| Name | Sensitivity / presence | Ownership | Requirement / purpose | Exact source references |
|---|---|---|---|---|
| AI_INTEGRATIONS_OPENAI_API_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Optional AI editorial integration key; independent billing/permission. | `artifacts/api-server/src/routes/blog.ts:589` |
| AI_INTEGRATIONS_OPENAI_BASE_URL | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Optional AI proxy base URL; configured as a Secret here, no value read. | `artifacts/api-server/src/routes/blog.ts:588` |
| AI_INTEGRATIONS_OPENAI_MODEL | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/routes/blog.ts:632`<br>`artifacts/api-server/src/routes/blog.ts:853` |
| APP_BUILD_ID | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/api-server/build.mjs:33`<br>`artifacts/api-server/src/lib/build-info.ts:13`<br>`artifacts/crypto-exchange-widget/vite.config.ts:36`<br>`artifacts/crypto-exchange-widget/vite.config.ts:42`<br>`scripts/production-build.mjs:23`<br>`scripts/verify-web-build.mjs:38` |
| APP_COMMIT | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/api-server/build.mjs:15`<br>`artifacts/api-server/src/lib/build-info.ts:14`<br>`artifacts/crypto-exchange-widget/vite.config.ts:20`<br>`artifacts/crypto-exchange-widget/vite.config.ts:43`<br>`scripts/production-build.mjs:10`<br>`scripts/verify-web-build.mjs:39` |
| APP_DATABASE_PASSWORD | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Required restricted runtime role password; never use original-company value. | `lib/db/migrate.mjs:9`<br>`lib/db/migrate.mjs:23`<br>`lib/db/runtime-database-config.mjs:12`<br>`lib/db/runtime-database-config.mjs:18` |
| ARBITRUM_MONITOR_RPC_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql:18` |
| AVAXC_MONITOR_RPC_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql:19` |
| BASE_MONITOR_RPC_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql:20` |
| BASE_PATH | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/crypto-exchange-widget/vite.config.ts:17`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:22`<br>`scripts/verify-web-build.mjs:7` |
| BASE_URL | Non-secret name; value not inspected | Platform-managed per deployment | Optional public provider endpoint override; official defaults can be shared, provider credentials cannot. | `artifacts/crypto-exchange-widget/src/components/payment-method-logo.tsx:9`<br>`artifacts/crypto-exchange-widget/src/components/shared-app-ui.tsx:13`<br>`artifacts/crypto-exchange-widget/src/lib/landing-background-config.ts:52`<br>`artifacts/quickxchange-telegram-mini-app/src/App.tsx:99` |
| BITCOIN_MONITOR_RPC_URL | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0109_bitcoin_mainnet_monitor.sql:10`<br>`lib/db/migrations/0109_bitcoin_mainnet_monitor.sql:38` |
| BLOG_API_ORIGIN | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Editorial script origin override; company deployment URL. | `artifacts/crypto-exchange-widget/server.mjs:246` |
| BSC_MONITOR_RPC_URL | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0089_recover_verified_bep20_usdt_payment.sql:27`<br>`lib/db/migrations/0089_recover_verified_bep20_usdt_payment.sql:48`<br>`lib/db/migrations/0091_recover_verified_live_bep20_usdt_payment.sql:33`<br>`lib/db/migrations/0098_recover_verified_bep20_usdt_payment.sql:31`<br>`lib/db/migrations/0098_recover_verified_bep20_usdt_payment.sql:48`<br>`lib/db/migrations/0099_bnb_bep20_native_monitor.sql:28`<br>`lib/db/migrations/0103_bsc_monitor_rpc_v2.sql:22`<br>`lib/db/migrations/0104_bsc_alchemy_log_range.sql:23`<br>`lib/db/run-production-monitoring-migrations.mjs:292` |
| BSC_MONITOR_RPC_URL_V2 | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0103_bsc_monitor_rpc_v2.sql:5`<br>`lib/db/migrations/0103_bsc_monitor_rpc_v2.sql:23`<br>`lib/db/migrations/0104_bsc_alchemy_log_range.sql:5`<br>`lib/db/migrations/0104_bsc_alchemy_log_range.sql:24`<br>`lib/db/migrations/0104_bsc_alchemy_log_range.sql:27`<br>`lib/db/run-production-monitoring-migrations.mjs:295`<br>`lib/db/run-production-monitoring-migrations.mjs:298`<br>`lib/db/run-production-monitoring-migrations.mjs:349` |
| CLERK_PUBLISHABLE_KEY | Public key; no value included | Per-client (separate Development/Production where applicable) | Required server public key, independently provisioned auth tenant; not a private secret. | `artifacts/api-server/src/app.ts:59` |
| CLERK_SECRET_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Server-only private key; required in production. | `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts:61` |
| COINBASE_USD_RATES_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Optional public provider endpoint override; official defaults can be shared, provider credentials cannot. | `artifacts/api-server/src/lib/manual-desk-rates.ts:297` |
| COINMARKETCAP_API_KEY | Sensitive/credential-bearing if set; no value inspected | Per-client (separate Development/Production where applicable) | Optional provider/image/metadata consumer; review cited active call site and licensing. | `artifacts/api-server/src/routes/blog.ts:523`<br>`artifacts/api-server/src/routes/blog.ts:1525`<br>`artifacts/api-server/src/routes/blog.ts:1533` |
| CUSTOMER_NOTIFICATION_FROM_EMAIL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Conditional Resend sender override; verified company domain required. Does not replace literal contact recipient. | `artifacts/api-server/src/lib/contact-support-email.ts:63`<br>`artifacts/api-server/src/lib/convert-admin-notifications.ts:283`<br>`artifacts/api-server/src/lib/customer-status-notifications.ts:781`<br>`artifacts/api-server/src/lib/newsletter.ts:176`<br>`artifacts/api-server/src/routes/notification-settings.ts:64` |
| CUSTOMER_NOTIFICATION_POLL_INTERVAL_MS | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/lib/convert-provider-boundary.ts:33`<br>`artifacts/api-server/src/routes/exchange.ts:433` |
| CUSTOMER_NOTIFICATION_RECOVERY_ADMIN_EMAIL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | One-time targeted recovery selector; private operational IDs/contacts must not be copied or prefilled. | `artifacts/api-server/src/lib/customer-status-notifications.ts:113` |
| CUSTOMER_NOTIFICATION_RECOVERY_EVENT_IDS | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | One-time targeted recovery selector; private operational IDs/contacts must not be copied or prefilled. | `artifacts/api-server/src/lib/customer-status-notifications.ts:114` |
| CUSTOMER_NOTIFICATION_RECOVERY_ORDER_ID | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | One-time targeted recovery selector; private operational IDs/contacts must not be copied or prefilled. | `artifacts/api-server/src/lib/customer-status-notifications.ts:112` |
| DATABASE_URL | Sensitive/credential-bearing if set; no value inspected | Per-client (separate Development/Production where applicable) | Required database connection/owner source; secret; independent DB per client. | `artifacts/api-server/src/scripts/export-workspace-config.ts:19`<br>`lib/db/benchmark-reconciliation-history.mjs:20`<br>`lib/db/benchmark-reconciliation-history.mjs:24`<br>`lib/db/drizzle.config.ts:4`<br>`lib/db/drizzle.config.ts:13`<br>`lib/db/migrate.mjs:6`<br>`lib/db/migrate.mjs:15`<br>`lib/db/run-online-order-directory-indexes.mjs:4`<br>`lib/db/run-online-order-directory-indexes.mjs:8`<br>`lib/db/runtime-database-config.mjs:2`<br>`lib/db/runtime-database-config.mjs:9`<br>`lib/db/src/index.ts:42`<br>`lib/db/src/test-admin.ts:7`<br>`lib/db/src/test-admin.ts:10` |
| DEFAULT_OBJECT_STORAGE_BUCKET_ID | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Chosen bucket identifier; independently isolate storage. | Names-only presence check; no static runtime reference found. May be selected by an Admin secret-reference field; verify active usage. |
| DEPLOYED_AT | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/api-server/build.mjs:32`<br>`artifacts/api-server/src/lib/build-info.ts:15`<br>`artifacts/crypto-exchange-widget/vite.config.ts:35`<br>`artifacts/crypto-exchange-widget/vite.config.ts:44`<br>`scripts/verify-web-build.mjs:40` |
| DEV | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/crypto-exchange-widget/src/components/error-boundary.tsx:100`<br>`artifacts/quickxchange-telegram-mini-app/src/components/error-boundary.tsx:50` |
| DEVELOPMENT_QUOTE_TIMING | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Development-only instrumentation; not live feature configuration. | `artifacts/api-server/src/lib/development-quote-timing.ts:17` |
| ETHEREUM_MONITOR_RPC_URL | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0101_configure_ethereum_mainnet_monitor.sql:27`<br>`lib/db/migrations/0101_configure_ethereum_mainnet_monitor.sql:33`<br>`lib/db/run-production-monitoring-migrations.mjs:83` |
| GCS_PROJECT_ID | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Required when GCS backend is selected. | `artifacts/api-server/src/index.ts:53`<br>`artifacts/api-server/src/lib/object-storage.ts:135` |
| GIT_COMMIT | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/api-server/build.mjs:15`<br>`artifacts/crypto-exchange-widget/vite.config.ts:20`<br>`scripts/production-build.mjs:12` |
| KRAKEN_XMR_USD_TICKER_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Optional public provider endpoint override; official defaults can be shared, provider credentials cannot. | `artifacts/api-server/src/lib/manual-desk-rates.ts:331` |
| LOG_LEVEL | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/lib/logger.ts:7` |
| MIGRATIONS_ONLY | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | One-shot production release mode; do not leave enabled in normal server execution. | `scripts/production-api-start.mjs:37` |
| NODE_ENV | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/index.ts:40`<br>`artifacts/api-server/src/lib/build-info.ts:16`<br>`artifacts/api-server/src/lib/client-ip.ts:62`<br>`artifacts/api-server/src/lib/customer-auth.ts:29`<br>`artifacts/api-server/src/lib/customer-auth.ts:36`<br>`artifacts/api-server/src/lib/customer-auth.ts:59`<br>`artifacts/api-server/src/lib/customer-status-notifications.ts:287`<br>`artifacts/api-server/src/lib/customer-status-notifications.ts:776`<br>`artifacts/api-server/src/lib/development-quote-timing.ts:16`<br>`artifacts/api-server/src/lib/development-quote-timing.ts:17`<br>`artifacts/api-server/src/lib/logger.ts:3`<br>`artifacts/api-server/src/lib/logger.ts:4`<br>`artifacts/api-server/src/lib/manual-desk-rates.ts:65`<br>`artifacts/api-server/src/lib/manual-desk-rates.ts:76`<br>`artifacts/api-server/src/lib/manual-desk-rates.ts:194`<br>`artifacts/api-server/src/lib/manual-swap-default-pair.ts:31`<br>`artifacts/api-server/src/lib/manual-swap-default-pair.ts:38`<br>`artifacts/api-server/src/lib/object-storage.ts:41`<br>`artifacts/api-server/src/lib/object-storage.ts:49`<br>`artifacts/api-server/src/lib/object-storage.ts:129`<br>`artifacts/api-server/src/lib/object-storage.ts:407`<br>`artifacts/api-server/src/lib/object-storage.ts:575`<br>`artifacts/api-server/src/lib/operator-auth.ts:53`<br>`artifacts/api-server/src/lib/operator-auth.ts:60`<br>`artifacts/api-server/src/lib/operator-auth.ts:147`<br>`artifacts/api-server/src/lib/operator-auth.ts:175`<br>`artifacts/api-server/src/lib/operator-auth.ts:369`<br>`artifacts/api-server/src/lib/provider-capabilities.ts:32`<br>`artifacts/api-server/src/lib/provider-capabilities.ts:318`<br>`artifacts/api-server/src/lib/provider-credentials.ts:120`<br>`artifacts/api-server/src/lib/provider-credentials.ts:496`<br>`artifacts/api-server/src/lib/quickex-order-service.ts:46`<br>`artifacts/api-server/src/lib/quickex.ts:200`<br>`artifacts/api-server/src/lib/quickex.ts:1450`<br>`artifacts/api-server/src/lib/quickex.ts:1459`<br>`artifacts/api-server/src/lib/rates-xml-methods.ts:18`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:351`<br>`artifacts/api-server/src/lib/whitebit-history-worker.ts:313`<br>`artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts:57`<br>`artifacts/api-server/src/routes/affiliate.ts:18`<br>`artifacts/api-server/src/routes/affiliate.ts:27`<br>`artifacts/api-server/src/routes/affiliate.ts:37`<br>`artifacts/api-server/src/routes/customer-management.ts:35`<br>`artifacts/api-server/src/routes/customer-management.ts:50`<br>`artifacts/api-server/src/routes/customer-management.ts:77`<br>`artifacts/api-server/src/routes/customer-management.ts:198`<br>`artifacts/api-server/src/routes/customer-management.ts:226`<br>`artifacts/api-server/src/routes/customer-management.ts:230`<br>`artifacts/api-server/src/routes/customer-management.ts:237`<br>`artifacts/api-server/src/routes/customer-management.ts:238`<br>`artifacts/api-server/src/routes/exchange-config.ts:40`<br>`artifacts/api-server/src/routes/operators.ts:32`<br>`artifacts/api-server/src/routes/operators.ts:42`<br>`artifacts/api-server/src/routes/telegram-mini-app.ts:236`<br>`artifacts/api-server/src/routes/whitebit.ts:1479`<br>`artifacts/api-server/src/scripts/export-workspace-config.ts:16`<br>`artifacts/crypto-exchange-widget/vite.config.ts:81`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:33`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:42`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:51`<br>`lib/db/src/index.ts:21`<br>`lib/db/src/index.ts:41`<br>`lib/db/src/test-admin.ts:4` |
| NOTIFICATIONS_DISABLED | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Maintenance/test delivery suppression; review before go-live. | `artifacts/api-server/src/lib/customer-status-notifications.ts:101` |
| OBJECT_STORAGE_BACKEND | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Required enum replit/gcs. S3-only startup is not currently supported. | `artifacts/api-server/src/index.ts:49`<br>`artifacts/api-server/src/lib/object-storage.ts:132`<br>`artifacts/api-server/src/lib/object-storage.ts:185` |
| OBJECT_STORAGE_UPLOAD_ORIGINS | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Required for GCS; exact tenant HTTPS upload origins/CORS. | `artifacts/api-server/src/index.ts:56`<br>`artifacts/api-server/src/lib/object-storage.ts:164` |
| ONEFORGE_API_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional company fiat rates subscription key. | `artifacts/api-server/src/lib/manual-desk-rates.ts:218`<br>`artifacts/api-server/src/lib/manual-desk-rates.ts:505` |
| ONEFORGE_BASE_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Optional public provider endpoint override; official defaults can be shared, provider credentials cannot. | `artifacts/api-server/src/lib/manual-desk-rates.ts:195` |
| OPERATOR_EMAILS | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Private company Owner/operator bootstrap allowlist; set new addresses, not original people. | `artifacts/api-server/src/lib/operator-auth.ts:252` |
| PGPASSWORD | Sensitive/credential-bearing if set; no value inspected | Per-client (separate Development/Production where applicable) | PostgreSQL credential source; never export value. | `lib/db/src/index.ts:44` |
| PGUSER | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | PostgreSQL owner/runtime override; production runtime removes owner variables after restricted pool creation. | `lib/db/src/index.ts:43` |
| POLYGON_MONITOR_RPC_URL | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql:21`<br>`lib/db/migrations/0107_polygon_native_pol_monitor.sql:28`<br>`lib/db/migrations/0108_polygon_usdt0_monitor.sql:110`<br>`lib/db/migrations/0115_restore_polygon_mainnet_reference.sql:4`<br>`lib/db/run-production-monitoring-migrations.mjs:201` |
| PORT | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/index.ts:17`<br>`artifacts/api-server/src/routes/telegram.ts:59`<br>`artifacts/crypto-exchange-widget/server.mjs:555`<br>`artifacts/crypto-exchange-widget/vite.config.ts:10`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:8` |
| PRIVATE_OBJECT_DIR | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Required tenant storage namespace; presence stored in Secrets does not make it a credential. | `artifacts/api-server/src/lib/object-storage.ts:374` |
| PUBLIC_APP_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Public HTTPS links for notifications/newsletter/blog/news workflows; new company origin. | `artifacts/api-server/src/lib/customer-status-notifications.ts:388`<br>`artifacts/api-server/src/lib/newsletter.ts:38`<br>`artifacts/api-server/src/lib/telegram-news.ts:19`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:336`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:352`<br>`artifacts/api-server/src/routes/blog.ts:154`<br>`artifacts/api-server/src/routes/telegram.ts:61` |
| PUBLIC_OBJECT_SEARCH_PATHS | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Tenant public image-search namespaces; source of uploaded public media. | Names-only presence check; no static runtime reference found. May be selected by an Admin secret-reference field; verify active usage. |
| PUBLIC_SITE_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Public-site origin consumer; must match canonical domain. | `artifacts/api-server/src/routes/telegram.ts:38` |
| QUICKEX_API_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Legacy/account indicator; not a replacement for the V2 signing pair. | `artifacts/api-server/src/lib/quickex.ts:238`<br>`artifacts/api-server/src/lib/quickex.ts:1477` |
| QUICKEX_BASE_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Optional public provider endpoint override; official defaults can be shared, provider credentials cannot. | `artifacts/api-server/src/lib/quickex.ts:230` |
| QUICKEX_CATALOG_TIMEOUT_MS | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/lib/quickex.ts:233` |
| QUICKEX_CREATE_TIMEOUT_MS | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/lib/quickex.ts:232` |
| QUICKEX_PUBLIC_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional Quickex V2 public/account credential; use new company account. | `artifacts/api-server/src/lib/quickex.ts:239`<br>`artifacts/api-server/src/lib/quickex.ts:1476` |
| QUICKEX_READ_TIMEOUT_MS | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/lib/quickex.ts:231` |
| QUICKEX_SECRET_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional private HMAC credential; server-only, new company key. | `artifacts/api-server/src/lib/quickex.ts:240`<br>`artifacts/api-server/src/lib/quickex.ts:1478` |
| REPLIT_DEPLOYMENT | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/api-server/src/lib/rates-xml-methods.ts:18`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:350` |
| REPLIT_DEPLOYMENT_ID | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/quickxchange-telegram-mini-app/vite.config.ts:32` |
| REPLIT_GIT_COMMIT | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/api-server/build.mjs:15`<br>`artifacts/crypto-exchange-widget/vite.config.ts:20`<br>`scripts/production-build.mjs:11`<br>`scripts/verify-web-build.mjs:39` |
| REPL_ID | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/crypto-exchange-widget/vite.config.ts:82`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:33`<br>`artifacts/quickxchange-telegram-mini-app/vite.config.ts:52` |
| RESEND_API_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Company email credential fallback/access; connector proxy call sites also require the correct connected Resend ownership. | `artifacts/api-server/src/lib/resend.ts:32`<br>`artifacts/api-server/src/lib/resend.ts:82` |
| SESSION_SECRET | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Required unique signing/encryption seed; fresh provider credentials/proofs must be enrolled. | `artifacts/api-server/src/index.ts:35`<br>`artifacts/api-server/src/lib/newsletter.ts:31`<br>`artifacts/api-server/src/lib/order-access.ts:13`<br>`artifacts/api-server/src/lib/order-source.ts:8`<br>`artifacts/api-server/src/lib/payment-methods.ts:219`<br>`artifacts/api-server/src/lib/provider-credentials.ts:127`<br>`artifacts/api-server/src/lib/quote-ticket.ts:244`<br>`artifacts/api-server/src/routes/telegram-mini-app.ts:71` |
| SITE_ACCESS_PASSWORD | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Optional/legacy site-access credential; inspect cited consumers and do not replace Clerk boundaries. | `artifacts/crypto-exchange-widget/server.mjs:407` |
| SOLANA_MONITOR_RPC_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql:22` |
| TELEGRAM_BOT_TOKEN | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Independent Exchange Bot token; conditional when enabled. | `artifacts/api-server/src/lib/telegram-api.ts:2`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:302`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:314`<br>`artifacts/api-server/src/routes/telegram-mini-app.ts:40` |
| TELEGRAM_BOT_USERNAME | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Expected Exchange Bot identity; verify token belongs to this username. | `artifacts/api-server/src/lib/telegram-api.ts:40` |
| TELEGRAM_MINI_APP_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Company Mini App launch URL; match BotFather/manifest build base. | `artifacts/api-server/src/routes/telegram.ts:40` |
| TELEGRAM_NEWS_BOT_TOKEN | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Independent News Bot token. | `artifacts/api-server/src/lib/telegram-news.ts:52`<br>`artifacts/api-server/src/lib/telegram-news.ts:77`<br>`artifacts/api-server/src/lib/telegram-news.ts:113`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:303`<br>`artifacts/api-server/src/lib/telegram-support-bot.ts:315` |
| TELEGRAM_NEWS_CHANNEL_ID | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Independent company news channel/chat identifier; set privately. | `artifacts/api-server/src/lib/telegram-news.ts:38`<br>`artifacts/api-server/src/lib/telegram-news.ts:42` |
| TELEGRAM_SUPPORT_BOT_TOKEN | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Independent Support Bot token; never reuse Exchange Bot token. | `artifacts/api-server/src/lib/telegram-support-bot.ts:283`<br>`artifacts/api-server/src/routes/telegram-support-bot.ts:213`<br>`artifacts/crypto-exchange-widget/src/pages/admin-telegram-support-bot.tsx:68` |
| TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Independent Support Bot webhook secret. | `artifacts/api-server/src/lib/telegram-support-bot.ts:287`<br>`artifacts/crypto-exchange-widget/src/pages/admin-telegram-support-bot.tsx:69` |
| TELEGRAM_SUPPORT_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Official company support destination; separately review published site settings. | `artifacts/api-server/src/routes/telegram-mini-app.ts:258`<br>`artifacts/api-server/src/routes/telegram.ts:1538`<br>`artifacts/api-server/src/routes/telegram.ts:1793` |
| TELEGRAM_WEBHOOK_SECRET | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Independent Exchange Bot webhook secret. | `artifacts/api-server/src/lib/telegram-support-bot.ts:301`<br>`artifacts/api-server/src/routes/telegram.ts:67` |
| TELEGRAM_WEBSITE_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Company website used in Bot profile/menu. | `artifacts/api-server/src/routes/telegram.ts:38` |
| TRON_MONITOR_API_URL | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional exact-network monitor endpoint/key reference. Credential-bearing RPC URLs belong in Secrets; do not infer a network from a vendor label. | `lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql:23`<br>`lib/db/migrations/0105_trx_tron_native_monitor.sql:27`<br>`lib/db/migrations/0106_reconcile_trx_tron_native_monitor.sql:28`<br>`lib/db/migrations/0112_configure_tron_mainnet_monitor.sql:43`<br>`lib/db/migrations/0113_reconcile_production_tron_monitor.sql:43`<br>`lib/db/migrations/0113_reconcile_production_tron_monitor.sql:78`<br>`lib/db/migrations/0114_restore_tron_endpoint_reference.sql:2`<br>`lib/db/run-production-monitoring-migrations.mjs:149` |
| TRUSTED_PROXY_HOPS | Non-secret name; value not inspected | Shared CORE convention; independent deployment setting | Runtime/build/tuning parameter; use the existing source default and reviewed host configuration. | `artifacts/api-server/src/lib/client-ip.ts:55` |
| USE_DATABASE_OWNER | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Privileged DB bypass; explicitly approved migration/test only, not the ordinary runtime. | `artifacts/api-server/src/scripts/export-workspace-config.ts:17`<br>`lib/db/runtime-database-config.mjs:8` |
| VITE_BRANDFETCH_CLIENT_ID | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Public image/logo fetch client identifier; browser-visible and per client/vendor agreement. | `artifacts/crypto-exchange-widget/src/lib/brandfetch.ts:8` |
| VITE_BUILD_ID | Non-secret name; value not inspected | Platform-managed per deployment | Platform/build identity; derive for each independent release. | `artifacts/quickxchange-telegram-mini-app/vite.config.ts:31` |
| VITE_CLERK_PROXY_URL | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Public Clerk proxy override; review allowed host and matching tenant. | `artifacts/crypto-exchange-widget/src/App.tsx:205` |
| VITE_CLERK_PUBLISHABLE_KEY | Public key; no value included | Per-client (separate Development/Production where applicable) | Browser-visible public auth key; build/environment must match tenant. | `artifacts/crypto-exchange-widget/src/App.tsx:202` |
| WHITEBIT_API_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional company deposit/account API credential. | `artifacts/api-server/src/lib/provider-credentials.ts:322`<br>`artifacts/api-server/src/lib/provider-credentials.ts:323`<br>`artifacts/api-server/src/lib/provider-credentials.ts:354`<br>`artifacts/api-server/src/lib/provider-credentials.ts:355` |
| WHITEBIT_API_SECRET | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional company private signing credential. | `artifacts/api-server/src/lib/provider-credentials.ts:322`<br>`artifacts/api-server/src/lib/provider-credentials.ts:323`<br>`artifacts/api-server/src/lib/provider-credentials.ts:354`<br>`artifacts/api-server/src/lib/provider-credentials.ts:355` |
| WHITEBIT_CREDENTIAL_SOURCE | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Explicit stored/environment provenance for supported recovery tooling; not blanket permission to change provider identity. | `artifacts/api-server/src/lib/provider-credentials.ts:40`<br>`artifacts/api-server/src/routes/exchange.ts:8330` |
| WHITEBIT_HISTORICAL_RECONCILIATION_APPROVED | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | One-time explicit historical approval; do not copy as permanently true. | `artifacts/api-server/src/lib/provider-credentials.ts:53` |
| WHITEBIT_HISTORY_CREDENTIAL_SOURCE | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | History preview provenance selector; do not replay original account history. | `artifacts/api-server/src/lib/whitebit-history-health.ts:29` |
| WHITEBIT_HISTORY_FRESH_AFTER | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | History activation boundary; reset for independent client operation. | `artifacts/api-server/src/lib/whitebit-history-health.ts:18` |
| WHITEBIT_HISTORY_WORKER_ENABLED | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Conditional history worker activation; company readiness required. | `artifacts/api-server/src/lib/whitebit-history-health.ts:28` |
| WHITEBIT_TEST_FAIL_RECOVERY | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Test/recovery failure simulation; must not be enabled for live clients. | `artifacts/api-server/src/routes/whitebit.ts:1479` |
| WHITEBIT_WEBHOOK_API_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional WhiteBIT webhook verification credential. | `artifacts/api-server/src/lib/whitebit-capabilities.ts:341`<br>`artifacts/api-server/src/lib/whitebit-capabilities.ts:362`<br>`artifacts/api-server/src/routes/whitebit.ts:1497` |
| WHITEBIT_WEBHOOK_PUBLIC_KEY | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional provider webhook public-verification credential. | `artifacts/api-server/src/routes/whitebit.ts:1490` |
| WHITEBIT_WEBHOOK_SECRET | Stored in Secrets; present; no value included | Per-client (separate Development/Production where applicable) | Conditional provider webhook secret; enroll for new client. | `artifacts/api-server/src/lib/whitebit-capabilities.ts:342`<br>`artifacts/api-server/src/lib/whitebit-capabilities.ts:363`<br>`artifacts/api-server/src/routes/whitebit.ts:1498` |
| WORKSPACE_CONFIG_EXPORT | Non-secret name; value not inspected | Per-client (separate Development/Production where applicable) | Development configuration-export mode; do not treat as whole-DB or cross-company export. | `artifacts/api-server/src/scripts/export-workspace-config.ts:18` |



## 8. New-company launch checklist

### Phase A — Scope, ownership and clean source

1. **Choose isolation:** create a separate project/deployment, database, object namespace and auth/provider accounts. Do not put a second company in the current singletons/database. Agree ownership, jurisdictions, supported assets/rails, banking/custody responsibility, pricing and customer-support obligations.
2. **Capture an approved source version:** reuse the current working repository and preserve Git history. Audit any uncommitted workspace changes before choosing a commit/branch. A current Git commit alone might not include those changes. Never copy .env files, attached private uploads, database dumps, exports of operations, connector tokens or cached process data.
3. **Use an explicit allowlist for reusable material:** source, schemas/migrations, tests and reviewed public/canonical assets. Do not copy customers/orders/Clerk users, provider ciphertext, wallet/address allocations, balances/ledgers, affiliate accounts/payouts, messages/subscribers, contact submissions, audit identities, sessions, webhook deliveries, leases or monitoring cursors/proofs.
4. **Remediate launch blockers in the client copy:** restrict the demonstration initializer before any empty-database request/worker startup; replace original referral attribution and every hardcoded identity/domain/contact destination. Do not alter immutable old migrations as a branding shortcut. These future changes were not made during this audit.
5. **Review licensing:** repository/package license, company-owned illustrations/photos, official logos, fonts, provider data/API terms, exchange/fiat/bank eligibility and infrastructure accounts. Public artwork availability is not a blanket commercial license.

### Phase B — Independent infrastructure and secrets

6. **Provision empty client databases** for Development and Production with restricted runtime access. Review the full migration chain for legacy seeds, append-only triggers, online indexes and role provisioning before applying it. Create independent signing/encryption and database-password secrets through secure secret tooling.
7. **Apply the current schema using the existing migration architecture:** on approved Development, the existing command is pnpm --filter @workspace/db run migrate. Production startup normally does NOT perform releases. Review lib/db/run-production-monitoring-migrations.mjs and the one-shot MIGRATIONS_ONLY=true path in scripts/production-api-start.mjs; include all required schema changes, including the XML publication cache table, through an approved release/schema-diff process. Do not casually run push-force against live data. Verify migration journal order and runtime grants.
8. **Provision independent Clerk auth:** configure company name/icon/sign-in providers and approved origins through the current managed/external auth controls. Development/Production are separate. Set new company Owners privately, require verified email and trusted TOTP enrollment/second-factor proof, and test deny-by-default Operator access. Never migrate the original company’s operator identities/permissions by copying customer tables.
9. **Configure object storage:** select the implemented replit or gcs backend, tenant private/public prefixes and bucket/project. Configure upload CORS for the exact company origin. Test verified upload, protected draft preview, published delivery and absence of cross-company paths. Do not assume an unimplemented S3-only backend works.
10. **Configure service paths and builds:** Website /, API /api and Mini App /telegram-mini-app/ unless deliberately changed. Keep manifests, Vite base paths, server routing, Clerk proxy and Bot registrations consistent. Set correct production variables per service; browser variables must contain no private credentials.
11. **Enroll company-owned providers:** new Quickex V2 keys/referral agreement; new WhiteBIT deposit/read permissions/webhook verification; 1Forge subscription; optional metadata/image/AI services. For Admin-stored credentials, connect afresh so encryption and verification are created under the new deployment secret. Do not copy original encrypted integration rows or their proofs.
12. **Configure chain monitoring privately:** new exact-network RPC endpoint secret references and validated chain/token identities. Review Alchemy Bitcoin behavior, EVM/ERC20/BEP20/Polygon, TRON and Solana adapter coverage against selected routes. Defaults in a catalog are not current readiness or proof of mainnet identity.

### Phase C — Brand, legal and supported product configuration

13. **Prepare a populated tenant configuration instance** based on tenant-config.json and company approval. The schema does not apply itself: map its values to existing Admin/env settings and a reviewed client-copy branding adaptation. Keep all operational feature toggles OFF until verification. Do not instantiate empty object examples as a working launch configuration.
14. **Replace all company-owned identity:** Website/Mini App light/dark/mobile artwork, favicons/app icon, logo alt/fallback text, headings, invoice metadata/footer, email subjects/footer/sender, bot profile/welcome text, blog covers/manual visuals, SEO/canonical/sitemap/robots/JSON-LD and every dictionary brand occurrence. Preserve actual canonical BTC/USDT/network/provider identities.
15. **Approve and publish company content:** legal entity/contact details, real support hours, Terms/Privacy/AML-KYC, FAQ/About/Contact/affiliates, public navigation, partner/social/trust links. Verify legitimacy of licenses/security/verification claims. Draft changes and public publication are distinct.
16. **Configure shared languages:** choose from en, fr, de, ru, es, ko, uk; use existing Languages settings and overrides for both Website and Mini App. Confirm fallback/persistence and company-specific copy in all enabled languages. Support Bot has separate locale configuration, including optional ar; do not infer Arabic Website/Mini App support from it.
17. **Configure catalog availability:** exact crypto asset/network IDs, selected coins/networks/fiat currencies/banks/rails, official artwork/flags, region/country/direction policies and active payment fields. Create IDs consistently, not with copied customer/financial rows. Review enabled-first catalog ordering and search identity.
18. **Configure Manual Swap commercial terms:** exact/wildcard/asset routes, source/target methods, precise rates or market references, markups/customer-benefit direction, fixed fees, tier ranges/min-max, add-ons, fee direction, settlement times and approved instructions. Verify reciprocal/wildcard precedence through the existing pricing preview. Do not introduce a separate white-label pricing engine.
19. **Configure funding/payout policy:** enter new company wallet/bank data securely. Validate exact network/memo/token decimals, monitoring/readiness or WhiteBIT route proof, deposit permissions and explicit Manual fallback policy. Do not copy any original address, frozen funding snapshot or monitoring activation boundary. Test new client routes with new isolated operational records only.
20. **Configure Convert:** verify signed provider capability and mapped exact routes for both Fixed/Floating. Select default pair only from executable routes. Preserve provider precision, quote integrity and idempotent create; XML values must never lock or replace a customer quote.
21. **Configure XML output:** use the existing /api/rates.xml serializer and automatic crypto/network code mapping. Map fiat/payment codes from the supplied official-code list, truthful payout reserves and finite valid limits. Missing/incomplete directions stay excluded until configured. Verify XML has legitimate items; test last-successful response headers under slow/failed refresh and intentional route disablement. Do not add a duplicate XML system or restore the deleted standalone Admin page.
22. **Configure affiliate program:** new enablement/provider scope/commissions/minimums/caps/cookie/marketing terms. Start with no original affiliate balances/accounts/ledger events and test eligibility/reversal rules in disposable fixtures.

### Phase D — Communication and publication integrations

23. **Verify email delivery:** new Resend account/connector, verified sender domain, customer/Admin templates and actual company contact-form recipient. Validate real test delivery and inbox placement; a successful API acceptance is not proof of inbox placement. Check newsletter unsubscribe and Read More links.
24. **Create independent Telegram bots:** Exchange Bot, Support Bot and optional News Bot; register new authenticated callbacks and Mini App URL. Verify getMe username/token agreement and separation of webhook secrets. Preserve canonical quote/order execution; do not use original chat/channel IDs or outbox history.
25. **Configure editorial automation carefully:** approved sources/topics/categories, timezone, schedule, generation/review policy, cover identity and SEO. Keep automatic financial claims/publication disabled until reviewed. Do not copy private drafts, contact/support updates or newsletter subscribers.

### Phase E — Validation and release gates

26. **Run verification in the new copy, not this audit:** pnpm run typecheck; pnpm run build:production; targeted API/provider/Telegram/XML/authorization tests through existing isolated runners. Use disposable databases for provider singleton/lifecycle tests. Do not run integration suites against a live client database or reuse old provider credentials to prove a new client account.
27. **Test all enabled customer languages and themes** across Website/Mini App: landing, selectors, Swap/Convert steps, errors, sign-in, creation/QR, instructions, tracking, account/history, legal/footer, manual and support. Verify Desktop/Tablet/Mobile, no original-brand/domain/contact remnants, no overflowing labels and correct exact-copy values.
28. **Verify critical financial/authorization journeys:** fresh quotes and limits, fixed/floating behavior, idempotent retry/unknown-outcome recovery, order ownership/source, wrong-network/address rejection, funding proof, status transitions, Admin TOTP/roles and cross-account denial. Validate a customer payment report is not operator settlement confirmation.
29. **Verify deployment health and boundary separation:** /api/healthz and /api/readyz, build identity, runtime DB grants, approved schema version, storage and configured provider health. Ensure new workers have only new client credentials/records and correct leases; no old outboxes, cursors or background deliveries can replay.
30. **Launch only after company sign-off:** DNS/TLS, canonical and webhook origins, legal/provider/commercial approvals, verified reserves/limits, secure backups and incident/runbook ownership. Publish with explicit company approval using a fresh production build; do not publish old dist output. Confirm actual live build/schema/data separation and run a safe live smoke check.
31. **Post-launch operations:** monitor provider health, quote failures, XML retained-rate age/item counts, delivery failures, chain lag/readiness, operational queues and security/access events. Rotate credentials through existing verification/activation boundaries, not direct ciphertext copying; maintain independent incident contacts and recovery procedures.

### Go/no-go acceptance checklist

- [ ] No original customer/order/balance/address/session/outbox data copied.
- [ ] Demo initializer cannot populate a live empty client database.
- [ ] New company identity/contact/domain/referral arrangement reviewed everywhere, including fallback/translated/static content.
- [ ] New authentication, keys, provider permissions, staff/TOTP and isolated storage/database verified.
- [ ] Enabled financial routes have current proof, accurate limits and truthful reserves; pricing/order logic remains canonical.
- [ ] Policy/claims and local legal obligations approved; no nonexistent automatic KYC capability advertised.
- [ ] All enabled languages/themes/devices and critical financial flows tested.
- [ ] Production schema, build identity, provider health, webhook origins and deliverability verified.
- [ ] Company explicitly approved publication and monitoring/recovery ownership.

## 9. Audit coverage and limitations

- Static analysis covered **1,427 relevant runtime/configuration/migration/static-source files**, 94 database-table declarations, 27 selected configuration contracts with 265 fields, and 94 environment/secret names including names-only presence checks. Bundled public assets and backend route declarations are indexed below.
- Excluded dependency/generated build directories, test fixtures as business configuration, migration snapshots, private uploads/attachments, exports, caches, .env files, mounted profiles and private agent metadata. The Canvas artifact is described as a non-production design tool rather than an operational exchange dependency. Source test structure/commands were reviewed for launch verification, not run during this audit.
- Exact source lines refer to the current workspace snapshot, including existing uncommitted work. Future edits shift line numbers. Appendix references deliberately point to source rather than generated bundles.
- Hardcoded inventory uses explicit identity/URL/color/font/legal/catalog/default matching plus TypeScript syntax traversal and schema review. It provides concrete captured locations; arbitrary generated strings, assembled values, vendor-hosted assets, binary artwork contents and future/untracked private data cannot be exhaustively classified from source alone. Do not interpret it as a guarantee that a global text replacement yields a safe rebrand.
- Live published Site Content, enabled pairs, company wallets, prices, limits/reserves, permissions and encrypted credentials were **not read**. They must be reviewed/configured independently in the new company deployment, not exported from original operations.
- No provider mutation/connection test, migration, typecheck/build, worker restart, code modification, credential change or publish was performed to create this blueprint. The application has not been converted to a tenant-config-driven runtime.
- Company-specific naming/style/content can change; financial precision/status/signing/idempotency/settlement/monitoring/authorization invariants remain CORE. Unsupported new provider, KYC or shared-hosting requirements are separate engineering work, not already-implemented configuration switches.


## Appendix A — Hardcoded values and exact source locations

This is a source inventory, not a customer-data export. Repeated values in the same file are grouped; **every listed line is an exact 1-based source line**. Runtime source, static assets and migration entry points are distinguished by category. Company-copy snippets longer than 1,400 characters are excerpted; the cited source contains the complete text. CSS entries include intentional theme/status colors and decorative gradients, not just the primary brand palette. Official provider URLs and network identities are CORE reference data unless a field explicitly permits a client override. Historical migration entries are not instructions to edit migration history. Dynamic Admin database values are described separately; they are not hardcoded and were not queried.


### Brand / company text / referral


**`artifacts/api-server/src/lib/blog-cover-system.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 220 | `QuickXchange Editorial` |

**`artifacts/api-server/src/lib/contact-support-email.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 64 | `QuickXchange Website <support@quickchange.exchange>` |
| 73 | `support@quickchange.exchange` |

**`artifacts/api-server/src/lib/convert-admin-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 284 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/api-server/src/lib/customer-deposit-eligibility.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 377 | `select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))` |

**`artifacts/api-server/src/lib/customer-status-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 221 | `Your QuickXchange order {{orderId}} has been created` |
| 225, 246 | `Thank you for choosing QuickXchange.` |
| 228 | `Payment received for QuickXchange order {{orderId}}` |
| 235 | `QuickXchange order {{orderId}} is processing` |
| 242 | `QuickXchange order {{orderId}} is complete` |
| 244 | `Great! Your exchange has been successfully completed. Thank you for using QuickXchange. We hope to see you again soon!` |
| 249 | `QuickXchange order {{orderId}} requires your attention` |
| 253 | `If you need help, please contact QuickXchange support.` |
| 608 | `&#96;<img class="qx-email-logo-dark" src="${escapeHtml(base)}/brand/quickxchange-header-dark.png" alt="QuickXchange" height="28" style="display:block;border:none;max-width:200px;outline:none;text-decoration:none;" /><img class="qx-email-logo-light" src="${escapeHtml(base)}/brand/quickxchange-header-light.png" alt="QuickXchange" height="0" style="display:none;height:0;max-height:0;overflow:hidden;border:none;max-width:225px;outline:none;text-decoration:none;" />&#96;` |
| 608 | `<span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">QuickXchange</span>` |
| 737 | `&#96;<img class="qx-email-logo-dark" src="${escapeHtml(base)}/brand/quickxchange-header-dark.png" alt="QuickXchange" height="20" style="display:block;border:none;max-width:200px;outline:none;text-decoration:none;margin:0 auto;" /><img class="qx-email-logo-light qx-email-logo-light-footer" src="${escapeHtml(base)}/brand/quickxchange-header-light.png" alt="QuickXchange" height="0" style="display:none;height:0;max-height:0;overflow:hidden;border:none;max-width:180px;outline:none;text-decoration:none;margin:0 auto;" />&#96;` |
| 737 | `<span style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">QuickXchange</span>` |
| 782 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/api-server/src/lib/newsletter-utils.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 18 | `https://quickxchange.invalid` |

**`artifacts/api-server/src/lib/newsletter.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 171 | `&#96;<div style="font-family:Arial,sans-serif;color:#111827;max-width:620px;margin:auto"><h1 style="color:#4f46e5">QuickXchange</h1><h2>${escapeHtml(campaign.title)}</h2><p>${escapeHtml(campaign.description)}</p><p><a href="${escapeHtml(readMoreUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Read More</a></p><p style="font-size:12px;color:#6b7280"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p></div>&#96;` |
| 172 | `&#96;QuickXchange\n\n${campaign.title}\n\n${campaign.description}\n\nRead More: ${readMoreUrl}\n\nUnsubscribe: ${unsubscribeUrl}&#96;` |
| 176 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/api-server/src/lib/provider-credentials.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 19 | `rook-provider-credentials` |
| 166 | `&#96;rook:${provider}:v${ENCRYPTION_VERSION}&#96;` |
| 422 | `&#96;select pg_advisory_xact_lock(hashtextextended(${&#96;rook:${provider}:credentials&#96;}, 0))&#96;` |
| 422 | `&#96;rook:${provider}:credentials&#96;` |

**`artifacts/api-server/src/lib/quickex.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 20 | `aff_35637` |

**`artifacts/api-server/src/lib/telegram-api.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 147 | `quickxchange-qr.png` |

**`artifacts/api-server/src/lib/telegram-convert-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 204 | `Your QuickXchange Convert order has been completed successfully.` |

**`artifacts/api-server/src/lib/telegram-link.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 22 | `This Telegram chat or QuickXchange account is already linked.` |

**`artifacts/api-server/src/lib/telegram-localization.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 8 | `Welcome to <b>QuickXchange</b>.` |
| 8 | `Review your QuickXchange order:` |
| 8 | `QuickXchange exchange routes are temporarily unavailable.` |
| 8 | `QuickXchange could not complete that step. Please try again.` |
| 9 | `Bienvenue sur <b>QuickXchange</b>.` |
| 10 | `مرحباً بك في <b>QuickXchange</b>.` |
| 11 | `Bienvenido a <b>QuickXchange</b>.` |
| 12 | `Willkommen bei <b>QuickXchange</b>.` |
| 13 | `Добро пожаловать в <b>QuickXchange</b>.` |
| 14 | `Вітаємо в <b>QuickXchange</b>.` |
| 15 | `<b>QuickXchange</b>에 오신 것을 환영합니다.` |

**`artifacts/api-server/src/lib/telegram-news.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 30 | `&#96;🔗 <a href="${escapeHtml(articleUrl)}">Read on QuickXchange</a>\n&#96;` |

**`artifacts/api-server/src/lib/telegram-support-bot.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 48 | `Welcome to QuickXchange Support. Choose a topic below to browse approved answers, or contact our support team.` |
| 49 | `Bienvenue au support QuickXchange. Choisissez un sujet pour consulter les réponses approuvées ou contactez notre équipe.` |
| 50 | `مرحباً بك في دعم QuickXchange. اختر موضوعاً للاطلاع على الإجابات المعتمدة أو تواصل مع فريق الدعم.` |
| 51 | `Te damos la bienvenida al soporte de QuickXchange. Elige un tema para consultar respuestas aprobadas o contacta con nuestro equipo.` |
| 52 | `Willkommen beim QuickXchange-Support. Wähle ein Thema für freigegebene Antworten oder kontaktiere unser Support-Team.` |
| 53 | `Добро пожаловать в службу поддержки QuickXchange. Выберите тему, чтобы посмотреть одобренные ответы, или свяжитесь с нашей командой.` |
| 54 | `Вітаємо у службі підтримки QuickXchange. Оберіть тему, щоб переглянути схвалені відповіді, або зв’яжіться з нашою командою.` |
| 55 | `QuickXchange 고객 지원에 오신 것을 환영합니다. 승인된 답변을 보려면 주제를 선택하거나 지원팀에 문의하세요.` |
| 528 | `Start QuickXchange Support` |
| 533, 821 | `QuickXchange Support` |
| 535 | `QuickXchange customer support. Browse approved help topics or contact our support team.` |
| 673 | `Thanks for contacting QuickXchange Support. I could not find an approved answer for this request. Our support team can help you further.` |
| 674 | `Merci d’avoir contacté le support QuickXchange. Je n’ai pas trouvé de réponse approuvée pour cette demande. Notre équipe peut vous aider.` |
| 675 | `شكراً لتواصلك مع دعم QuickXchange. لم أجد إجابة معتمدة لهذا الطلب. يمكن لفريق الدعم مساعدتك.` |
| 676 | `Gracias por contactar con el soporte de QuickXchange. No encontré una respuesta aprobada para esta consulta. Nuestro equipo puede ayudarte.` |
| 677 | `Danke, dass du den QuickXchange-Support kontaktierst. Dafür gibt es keine freigegebene Antwort. Unser Support-Team hilft dir gerne weiter.` |
| 678 | `Спасибо, что обратились в поддержку QuickXchange. Для этого запроса нет одобренного ответа. Наша команда поможет вам.` |
| 679 | `Дякуємо, що звернулися до підтримки QuickXchange. Для цього запиту немає схваленої відповіді. Наша команда допоможе вам.` |
| 680 | `QuickXchange 고객 지원에 문의해 주셔서 감사합니다. 이 요청에 대한 승인된 답변이 없습니다. 지원팀이 도와드리겠습니다.` |
| 729 | `QuickXchange FAQ` |

**`artifacts/api-server/src/lib/telegram-swap-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 618 | `Your QuickXchange order has been completed successfully.` |

**`artifacts/api-server/src/lib/whitebit-history-worker.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 171 | `select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))` |

**`artifacts/api-server/src/routes/blog.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 634 | `quickxchange_blog_article` |
| 636 | `&#96;You are a fact-bound financial editor. Write an original article in ${settings.language}. Use only facts explicitly supported by the supplied sources. Never infer prices, percentages, dates, or market claims. If a fact is not supported, omit it. Do not copy source wording. Return only the requested JSON. Body HTML may use p, h2, h3, ul, ol, li, strong, em, and a tags; no scripts, styles, iframes, or inline event handlers. Every material factual claim must have a citation to an exact supplied source URL. Internal links must use only the supplied published article slugs.${officialMetadataOnly ? " This is an official publisher feed-metadata brief: use only the supplied headline and short feed summary, write a concise original QuickXchange news brief (120-900 readable characters), explicitly attribute the reporting to the named publisher, never say QuickXchange reported or investigated it, and do not add context or claims not present in the metadata." : ""}&#96;` |
| 636 | ` This is an official publisher feed-metadata brief: use only the supplied headline and short feed summary, write a concise original QuickXchange news brief (120-900 readable characters), explicitly attribute the reporting to the named publisher, never say QuickXchange reported or investigated it, and do not add context or claims not present in the metadata.` |
| 637 | `&#96;Topic: ${topic}\nMinimum body text length: ${settings.minimumArticleLength} characters.\nAllowed categories: ${(settings.categories as string[]).join(", ") &#124;&#124; "Crypto News, Guides, Exchange, Bitcoin, Ethereum, Stablecoins, Security, Market Insights, QuickXchange Updates"}\nKeywords to use only when supported: ${(settings.keywords as string[]).join(", ")}\nPublished articles available for internal links: ${JSON.stringify(internalLinkCandidates)}\n${qualityAttempt > 0 ? &#96;Rewrite attempt ${qualityAttempt + 1}: the previous draft contained a verbatim source phrase. Preserve only supported facts but use substantially different sentence structure and wording.\n&#96; : ""}${promptSources}&#96;` |
| 637 | `Crypto News, Guides, Exchange, Bitcoin, Ethereum, Stablecoins, Security, Market Insights, QuickXchange Updates` |
| 666 | `&#96;QuickXchange summary based on ${publisher}'s official feed metadata.&#96;` |
| 717 | `quickxchange-cover-v3` |
| 770 | `&#96;QuickXchange ${design.template} editorial template for "${safeTitle}" with assets: ${design.detectedAssets.join(", ") &#124;&#124; "category-specific geometry"}.&#96;` |
| 771, 788, 809, 815, 861 | `quickxchange-template-system` |
| 802 | `&#96;Deterministic branded QuickXchange cover for ${imagePromptPart(topic, 180)}&#96;` |
| 807 | `&#96;QuickXchange editorial cover for the ${imagePromptPart(article.category, 100)} article about ${imagePromptPart(topic, 180)}.&#96;` |
| 839, 1322, 1364 | `QuickXchange Editorial` |

**`artifacts/api-server/src/routes/exchange.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3526, 5542, 5706, 6119, 6661, 7040, 8409, 8887 | `select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))` |
| 8569 | `&#96;select pg_advisory_xact_lock(hashtextextended('rook:whitebit:address-permission:' &#124;&#124; ${req.body.networkId}, 0))&#96;` |

**`artifacts/api-server/src/routes/newsletter.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 52 | `<h1>You have been unsubscribed</h1><p>You will no longer receive QuickXchange newsletter emails.</p>` |

**`artifacts/api-server/src/routes/notification-settings.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21 | `https://quickchange.exchange/api/telegram/webhook` |
| 47 | `Resend rejected the message because quickchange.exchange is not verified. Verify quickchange.exchange in Resend, then retry.` |
| 64 | `QuickXchange <support@quickchange.exchange>` |
| 106 | `QuickXchange Admin notification test` |
| 107 | `This is a real QuickXchange email delivery test. Resend accepting this request does not confirm inbox placement.` |
| 108 | `<div style="font-family:Arial,sans-serif;padding:24px"><h2>QuickXchange Admin notification test</h2><p>This is a real email delivery test. Please confirm it appears in your mailbox.</p></div>` |
| 124 | `<b>QuickXchange Admin notification test</b><br><br>Your Admin Telegram notifications are connected and ready.` |

**`artifacts/api-server/src/routes/site-content.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 134 | `/brand/quickxchange-header-light.png` |
| 135 | `/brand/quickxchange-header-dark.png` |

**`artifacts/api-server/src/routes/telegram.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 163 | `🔔 <b>QuickXchange order update</b>` |
| 582 | `&#96;QuickXchange could not load this route: ${html(result.error ?? "route unavailable")}&#96;` |
| 598 | `QuickXchange could not load current Manual Swap add-ons. Please try again later.` |
| 603 | `QuickXchange returned an invalid Manual Swap add-on list.` |
| 1329 | `&#96;QuickXchange could not quote this route: ${html(result.error ?? "route unavailable")}&#96;` |
| 1645 | `&#96;QuickXchange could not create the order: ${html(result.error ?? "please check the details and try again")}\nYour review is still saved; you may retry safely.&#96;` |
| 1647 | `&#96;QuickXchange could not confirm whether the order was created: ${html(result.error ?? "provider timeout")}\nPlease do not start over. Retry only when reconciliation confirms no order exists.&#96;` |
| 1731 | `✅ <b>Telegram Connected</b><br><br>This private chat will now receive enabled QuickXchange Admin notifications.` |
| 1784 | `Start QuickXchange` |
| 1791, 1798 | `QuickXchange` |

**`artifacts/api-server/src/routes/whitebit.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 421 | `select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))` |

**`artifacts/api-server/src/scripts/regenerate-blog-covers.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `quickxchange-cover-v3` |
| 51 | `quickxchange-template-system` |
| 69 | `&#96;QuickXchange ${categoryName} cover for ${article.title}.&#96;` |
| 79 | `system:quickxchange-cover-v3` |

**`artifacts/crypto-exchange-widget/server.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `quickchange.exchange` |
| 80, 83 | `quickxchange-access-compare` |
| 331, 335 | `QuickXchange Blog` |
| 335 | `&#96;<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${blogMeta({ title: "QuickXchange Blog", description: "Insights and updates from QuickXchange.", canonical })}</head><body><header><nav aria-label="Breadcrumb"><a href="/">QuickXchange</a> <span aria-hidden="true">/</span> <span>Blog</span></nav><h1>QuickXchange Blog</h1></header><main>${cards &#124;&#124; "<p>No published articles are available.</p>"}</main><script type="application/ld+json">${escapeJsonLd(jsonLd)}</script></body></html>&#96;` |
| 335 | `Insights and updates from QuickXchange.` |
| 356 | `QuickXchange Editorial` |
| 359 | `&#96;<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${blogMeta({ title: article.seoTitle &#124;&#124; article.title, description, canonical, image: imageUrl, robots })}</head><body><nav aria-label="Breadcrumb"><a href="/">QuickXchange</a> <span aria-hidden="true">/</span> <a href="/blog">Blog</a> <span aria-hidden="true">/</span> <span>${escapeHtml(article.title)}</span></nav><main><article><header><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.excerpt &#124;&#124; "")}</p>${article.authorName ? &#96;<p>By ${escapeHtml(article.authorName)}</p>&#96; : ""}${imageMarkup}</header><section>${safeArticleHtml(article)}</section>${citations ? &#96;<footer><h2>Sources</h2><ul>${citations}</ul></footer>&#96; : ""}</article>${related ? &#96;<aside><h2>Related articles</h2><ul>${related}</ul></aside>&#96; : ""}</main><script type="application/ld+json">${escapeJsonLd(jsonLd)}</script></body></html>&#96;` |

**`artifacts/crypto-exchange-widget/src/App.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 223 | `/brand/quickxchange-header-light.png` |
| 224 | `/brand/quickxchange-header-dark.png` |
| 1115 | `QuickXchange` |

**`artifacts/crypto-exchange-widget/src/components/admin-order-support-tools.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 101 | `quickx-order-card min-w-0 border p-4 sm:p-5 rounded-xl shadow-sm space-y-6` |
| 152, 167, 188, 203, 286, 380 | `quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold` |

**`artifacts/crypto-exchange-widget/src/components/admin-whitebit-asset-sync-dialog.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 134 | `adminCatalog.alreadyInQuickXchange` |

**`artifacts/crypto-exchange-widget/src/components/brand-logo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 32 | `/brand/quickxchange-header-light.png` |
| 33 | `/brand/quickxchange-header-dark.png` |
| 54 | `QuickXchange` |

**`artifacts/crypto-exchange-widget/src/components/exchange-surface.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 43 | `@/components/quickxchange-overlay` |

**`artifacts/crypto-exchange-widget/src/components/manual/manual-guides.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 38 | `&#96;${basePath}/brand/quickxchange-mark.png&#96;` |
| 39 | `QuickXchange` |

**`artifacts/crypto-exchange-widget/src/components/order-completion.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 121 | `Preparing QuickXchange invoice` |
| 129 | `&#96;QuickXchange invoice ${invoice.id}&#96;` |
| 133 | `&#96;QuickXchange Invoice ${invoice.id}&#96;` |

**`artifacts/crypto-exchange-widget/src/components/shared-app-ui.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 10 | `https://t.me/QuickXchangeNetBot` |
| 11 | `support@quickchange.exchange` |
| 235 | `Check the complete QuickXchange order ID and try again.` |

**`artifacts/crypto-exchange-widget/src/components/telegram-bot-promo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 80 | `&#96;${basePath}/brand/quickxchange-telegram-bot-logo.jpg&#96;` |
| 81 | `QuickXchange` |

**`artifacts/crypto-exchange-widget/src/components/universal-search-sheet.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5 | `@/components/quickxchange-overlay` |

**`artifacts/crypto-exchange-widget/src/lib/invoice-pdf.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 90 | `quickxchange-v1.png` |
| 95 | `&#96;QuickXchange Invoice ${invoice.id}&#96;` |
| 96 | `QuickXchange` |
| 265 | `Thank you for choosing QuickXchange.` |
| 266 | `quickxchange.net` |
| 282 | `&#96;quickxchange-invoice-${invoice.id}.pdf&#96;` |

**`artifacts/crypto-exchange-widget/src/lib/legal-page-content.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 9 | `This notice for QuickXchange ("Company," "we," "us," or "our") describes how and why we might collect, store, use, and/or share ("process") your information when you use our Services, such as when you visit the QuickXchange platform or another platform of ours that links to this notice, or engage with us in other related ways, including sales, marketing, or events.<br><br>Questions or concerns? Reading this notice will help you understand your rights and choices.` |
| 17 | `When you visit, use, or navigate our Services, we may process personal information depending on how you interact with QuickXchange and the Services, the choices you make, and the products and features you use.` |
| 48 | `We collect personal information that you voluntarily provide when you register for the Services, request information about our products or services, participate in activities on the Services, complete a transaction, or contact us.<br><br>The information we collect depends on your interactions with QuickXchange, the choices you make, and the products and features you use. It may include your name, phone number, email address, username, billing details, and payment or wallet information needed for a selected transaction route.<br><br>All personal information you provide must be true, complete, and accurate, and you must notify us of relevant changes.` |

**`artifacts/crypto-exchange-widget/src/lib/market-convert-selection.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `quickxchange:market-convert-selection` |
| 4 | `quickxchange:market-swap-selection` |

**`artifacts/crypto-exchange-widget/src/pages/admin-appearance.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 212 | `/brand/quickxchange-header-dark.png` |
| 213 | `/brand/quickxchange-header-light.png` |

**`artifacts/crypto-exchange-widget/src/pages/admin.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1999 | `Your exchange is completed! Thank you for using QuickXchange!` |
| 2161 | `admin@quickchange.exchange` |
| 2298, 2548 | `QuickXchange` |
| 2349 | `QuickXchange Bot` |
| 2491 | `e.g. Your QuickXchange Order {{orderId}}` |
| 2532 | `e.g. Thank you for choosing QuickXchange!` |
| 2568 | `https://quickchange.exchange/status` |
| 2569 | `https://quickchange.exchange/status?invoice=1` |
| 2570 | `https://www.trustpilot.com/review/quickchange.exchange` |
| 5145 | `quickx-send-card` |
| 5145 | `quickx-receive-card` |
| 5159 | `quickx-important-value block truncate text-[13px] font-black` |
| 5170 | `quickx-exchange-card relative overflow-hidden rounded-2xl border p-4` |
| 5193 | `quickx-rate-card min-w-0 rounded-lg border p-2` |
| 5195 | `quickx-important-value mt-1 block truncate text-[9px]` |
| 5584 | `quickx-view-order w-full sm:w-[480px] sm:max-w-full h-[100dvh] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300` |
| 5589 | `quickx-order-header flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b` |
| 5605 | `quickx-secondary-label text-muted-foreground font-medium` |
| 5641 | `quickx-order-card rounded-xl border p-3` |
| 5680 | `quickx-status-active` |
| 5681 | `quickx-status-active border-red-500 text-red-400` |
| 5686 | `quickx-progress-label text-[10px] text-center font-bold tracking-wide uppercase leading-tight max-w-[80px]` |
| 5698 | `quickx-order-card quickx-manual-status border p-4 rounded-xl shadow-sm space-y-2` |
| 5721, 5774 | `quickx-order-card border rounded-xl p-1 shadow-sm` |
| 5724, 5777, 5795 | `quickx-field-label text-xs text-muted-foreground` |
| 5726 | `quickx-important-value text-xs font-bold truncate max-w-[200px]` |
| 5737 | `quickx-order-card border rounded-xl p-4 space-y-3` |
| 5768, 5790, 5806, 5882, 5892 | `quickx-section-label text-xs font-bold uppercase tracking-wider text-muted-foreground` |
| 5779 | `quickx-important-value` |
| 5785 | `quickx-order-card rounded-xl border p-4 text-sm text-muted-foreground` |
| 5793 | `quickx-order-card flex items-center justify-between gap-3 rounded-xl border p-4` |
| 5804 | `quickx-order-card border rounded-xl p-4 shadow-sm space-y-4` |
| 5857 | `quickx-order-card rounded-xl border border-border p-4 shadow-sm` |
| 5883 | `quickx-order-card border p-4 rounded-xl shadow-sm text-sm text-white/55` |
| 5893 | `quickx-order-card border rounded-xl p-4 shadow-sm space-y-3` |
| 5915 | `quickx-order-footer flex shrink-0 items-center gap-3 border-t px-4 sm:px-6 py-4` |

**`artifacts/crypto-exchange-widget/src/pages/blog-detail.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 94 | `&#96;${data.title} &#124; QuickXchange Intelligence&#96;` |
| 128, 176 | `QuickXchange` |
| 175 | `QuickXchange Editorial` |

**`artifacts/crypto-exchange-widget/src/pages/blog.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 57 | `Market Intelligence &#124; QuickXchange` |
| 61 | `&#96;${categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1)} News &#124; QuickXchange&#96;` |
| 64 | `&#96;Search: ${searchParam} &#124; QuickXchange&#96;` |
| 75, 102 | `QuickXchange` |

**`artifacts/crypto-exchange-widget/src/pages/faq.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11, 22 | `&#96;${title} &#124; QuickXchange&#96;` |
| 36 | `What is QuickXchange?` |
| 37 | `QuickXchange is a guided crypto exchange designed to provide clear route, payment, transfer, and order information before you act.` |
| 41 | `Swap uses configured QuickXchange routes and guided settlement/payment details. Convert uses supported provider conversion routes when available.` |
| 71 | `Wrong-network transfers may not be recoverable. Contact QuickXchange support with your order details and TXID so the transfer can be reviewed, without assuming recovery is possible.` |
| 87 | `Review the quote and order details for the fees applied to your selected route. QuickXchange does not assume fees that are not shown in those details.` |
| 102 | `How do I contact QuickXchange support?` |

**`artifacts/crypto-exchange-widget/src/pages/how-it-works.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 471 | `How QuickXchange Works &#124; QuickXchange` |

**`artifacts/crypto-exchange-widget/src/pages/order-confirmation.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 123 | `&#96;${order.id} · Order Created · QuickXchange&#96;` |
| 124 | `Order Confirmation · QuickXchange` |

**`artifacts/crypto-exchange-widget/src/pages/public-info-pages.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 18, 29 | `&#96;${title} &#124; QuickXchange&#96;` |
| 49 | `QuickXchange` |
| 155 | `What makes QuickXchange different?` |

**`artifacts/crypto-exchange-widget/src/pages/site-content.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 184 | `QUICKXCHANGE` |
| 616, 635 | `Promote QuickXchange among your affiliates and teach them how to exchange between payment methods. Earn 30% of fees from their orders.` |
| 672 | `What Makes QuickXchange Different` |
| 678 | `What makes QuickXchange different?` |
| 1812 | `&#96;${title} &#124; QuickXchange&#96;` |
| 1931 | `QUICKXCHANGE / SITE SETTINGS` |

**`artifacts/crypto-exchange-widget/src/pages/telegram-connect.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 20 | `This Telegram account is already connected to another QuickXchange account. If you believe this is a mistake, contact QuickXchange support.` |
| 43 | `QuickXchange` |

**`artifacts/crypto-exchange-widget/src/pages/user-manual.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 17 | `&#96;${t("customer.m943f7e1248b9")} &#124; QuickXchange&#96;` |
| 19, 96 | `https://quickchange.exchange/user-manual` |
| 48, 79 | `QuickXchange` |
| 80, 90 | `https://quickchange.exchange` |

**`artifacts/quickxchange-telegram-mini-app/package.json`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `@workspace/quickxchange-telegram-mini-app` |

**`artifacts/quickxchange-telegram-mini-app/src/components/mini-app-logo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 178, 183, 184, 185 | `QuickXchange` |

**`lib/api-zod/src/generated/api.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2566 | `Exact Rook status, or active for every non-terminal status.` |

**`lib/i18n/src/completed/de.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `QuickXchange` |
| 73 | `Offizielle QuickXChange-Community-Kanäle` |
| 83 | `QuickXchange-Konvertierungsbildschirm mit Krypto-Auswahl und Auswahl für variable Wechselkurse` |
| 91 | `Teilen Sie Ihre Erfahrung mit QuickXchange` |
| 109 | `QuickXchange-Konto verknüpfen` |
| 121 | `Öffnen Sie den offiziellen QuickXchange-Telegram-Bot und drücken Sie auf Start.` |
| 125 | `QuickXchange &mdash; Alle Rechte vorbehalten.` |
| 129 | `QuickXchange Bestell-ID` |
| 134 | `Tauschen Sie Kryptowährungen, erstellen und verfolgen Sie Bestellungen und erhalten Sie Unterstützung direkt über Telegram – schnell, einfach und immer mit QuickXchange verbunden.` |
| 202 | `Tauschen Sie mit QuickXchange auf Telegram` |
| 252 | `QuickXchange bietet zwei verschiedene Tauschwege, die auf Ihre Bedürfnisse zugeschnitten sind. Die Auswahl des richtigen Weges sorgt für eine reibungslose Transaktion.` |
| 283 | `Durchsuchen Sie aktivierte Krypto-Konvertierungsrouten und fahren Sie mit Ihrem ausgewählten Paar im QuickXchange Convert-Flow fort.` |
| 357 | `Wie QuickXchange funktioniert` |
| 388 | `Durchsuchen Sie die verfügbaren QuickXchange-Konvertierungsrouten, filtern Sie Kryptopaare und fahren Sie mit dem ausgewählten Paar im Konvertierungs-Widget fort.` |
| 392 | `QuickXchange bietet ein Partnerprogramm für Benutzer, die andere auf die Plattform einladen möchten.` |
| 408 | `Geben Sie Ihre QuickXchange-Bestell-ID ein, um den aktuellen Status und Transaktionsdetails einzusehen.` |
| 447 | `QuickXChange folgen` |
| 512 | `Verknüpfen Sie Ihr QuickXchange-Konto, um Ihre Bestellungen sicher über alle Plattformen hinweg zu verwalten.` |
| 560 | `QuickXchange-Swap-Bildschirm mit den Auswahlen für 'Sie senden' und 'Sie erhalten'` |
| 575 | `Folgen Sie QuickXChange auf {{v0}}` |
| 580 | `👋 Willkommen bei QuickXchange!` |
| 581 | `Wählen Sie eine beliebte aktive Route und fahren Sie direkt im QuickXchange-Widget fort.` |
| 582 | `QuickXchange-Bestellverfolgungsseite mit einem Feld für die Bestell-ID und einer Schaltfläche zur Bestellverfolgung` |
| 583 | `Ihr QuickXchange-Konto ist jetzt mit Telegram verbunden. Sie können zu Telegram zurückkehren, um fortzufahren.` |
| 587 | `Willkommen bei QuickXchange. Drücken Sie Start, um das Bot-Menü zu öffnen.` |
| 594 | `Benötigen Sie Hilfe bei einer Bestellung oder haben Sie Fragen zu QuickXchange? Unser Team ist hier, um Ihnen zu helfen.` |
| 618 | `QuickXchange ergreift Maßnahmen, um das Risiko zu verringern, dass seine Dienste für Geldwäsche, Terrorismusfinanzierung, Betrug, Sanktionsumgehung oder andere verbotene Aktivitäten genutzt werden.` |
| 654 | `E-Mail an den QuickXchange-Support` |
| 675 | `QuickXchangeBot` |
| 685 | `Willkommen beim QuickXchange-Benutzerhandbuch. Dieser Leitfaden bietet Schritt-für-Schritt-Anleitungen zur Navigation auf der Handelsplattform. Egal, ob Sie einen unterstützten manuellen Swap-Weg oder einen automatisierten Krypto-zu-Krypto-Konvertierungsweg nutzen, verwenden Sie dieses Dokument, um jede Phase zu verstehen, bevor Sie Gelder überweisen.` |
| 688 | `Krypto-Paare &#124; QuickXchange` |
| 704 | `Sie finden dies in Ihrer QuickXchange-Bestellbestätigung oder unter „Meine Bestellungen“, wenn Sie eingeloggt sind.` |
| 720 | `Nehmen Sie sich einen Moment Zeit, um die Ziel- und Rückerstattungsadressen doppelt zu überprüfen. Blockchain-Transaktionen sind unwiderruflich. QuickXchange kann an falsche Adressen gesendete Gelder nicht zurückerhalten.` |
| 779 | `QuickXchange-Konto` |
| 802 | `Danke — Sie haben die QuickXchange-Updates abonniert.` |
| 816 | `Filtern Sie die aktivierten Konvertierungsrouten, die von QuickXchange veröffentlicht wurden.` |
| 825 | `Werben Sie bei Ihren Partnern für QuickXchange und zeigen Sie ihnen, wie sie zwischen Zahlungsmethoden wechseln können. Verdienen Sie 30 % der Gebühren aus ihren Bestellungen.` |
| 848 | `Kontaktieren Sie den QuickXchange-Support auf Telegram` |
| 856 | `Willkommen bei QuickXchange` |
| 871 | `QuickXchange Bot öffnen` |
| 892 | `QuickXchange ist für die sichere Verwendung in Telegram konzipiert. Bitte öffnen Sie den Bot, um auf Ihr Konto zuzugreifen.` |
| 947 | `Identitätsprüfung und AML-Richtlinie &#124; QuickXchange` |
| 948 | `Lesen Sie die QuickXchange-Richtlinie zur Identitätsprüfung, Mittelherkunft, Transaktionsprüfung und Geldwäschebekämpfung.` |
| 949 | `Die AML-Richtlinie legt die Grundsätze fest, die QuickXchange bei der Identitätsprüfung, bei der Prüfung der Mittelherkunft, bei der Überprüfung verdächtiger Transaktionen, bei der Zusammenarbeit mit Benutzern und bei rechtmäßigen Informationsanfragen anwendet. Sie gilt für Benutzer und Transaktionen, bei denen eine Überprüfung oder eine erweiterte Prüfung erforderlich ist.` |
| 979 | `Dieser Hinweis für QuickXchange („Unternehmen“, „wir“, „uns“ oder „unser“) beschreibt, wie und warum wir Ihre Informationen sammeln, speichern, verwenden und/oder teilen („verarbeiten“) können, wenn Sie unsere Dienste nutzen, etwa wenn Sie die QuickXchange-Plattform oder eine andere unserer Plattformen besuchen, die mit diesem Hinweis verknüpft ist, oder wenn Sie anderweitig mit uns interagieren, einschließlich Verkauf, Marketing oder Veranstaltungen. Fragen oder Bedenken? Das Lesen dieses Hinweises wird Ihnen helfen, Ihre Rechte und Wahlmöglichkeiten zu verstehen.` |
| 983 | `Wenn Sie unsere Dienste besuchen, nutzen oder darin navigieren, verarbeiten wir möglicherweise personenbezogene Daten, abhängig davon, wie Sie mit QuickXchange und den Diensten interagieren, welche Entscheidungen Sie treffen und welche Produkte und Funktionen Sie nutzen.` |
| 997 | `Wir sammeln personenbezogene Daten, die Sie freiwillig bereitstellen, wenn Sie sich für die Dienste registrieren, Informationen über unsere Produkte oder Dienste anfordern, an Aktivitäten auf den Diensten teilnehmen, eine Transaktion durchführen oder uns kontaktieren. Die Informationen, die wir sammeln, hängen von Ihren Interaktionen mit QuickXchange, den Entscheidungen, die Sie treffen, und den Produkten und Funktionen ab, die Sie nutzen. Dazu können Ihr Name, Ihre Telefonnummer, E-Mail-Adresse, Ihr Benutzername, Abrechnungsdetails sowie Zahlungs- oder Wallet-Informationen gehören, die für einen ausgewählten Transaktionsweg erforderlich sind. Alle von Ihnen bereitgestellten personenbezogenen Daten müssen wahr, vollständig und genau sein, und Sie müssen uns über relevante Änderungen informieren.` |
| 2295 | `QuickXchange Editorial` |
| 2297 | `Marktintelligenz &#124; QuickXchange` |
| 2299 | `Was ist QuickXchange?` |
| 2300 | `QuickXchange ist ein geführter Krypto-Austausch, der entwickelt wurde, um klare Routen-, Zahlungs-, Überweisungs- und Bestellinformationen bereitzustellen, bevor Sie handeln.` |
| 2301 | `Swap nutzt konfigurierte QuickXchange-Routen und geführte Abwicklungs-/Zahlungsdetails. Convert nutzt unterstützte Anbieter-Konvertierungsrouten, sofern verfügbar.` |
| 2314 | `Überweisungen über das falsche Netzwerk sind möglicherweise nicht wiederherstellbar. Kontaktieren Sie den QuickXchange-Support mit Ihren Bestelldetails und der TXID, damit die Überweisung geprüft werden kann, ohne dass eine Wiederherstellung garantiert werden kann.` |
| 2322 | `Überprüfen Sie das Angebot und die Bestelldetails für die auf Ihre gewählte Route angewendeten Gebühren. QuickXchange übernimmt keine Gebühren, die nicht in diesen Details aufgeführt sind.` |
| 2329 | `Wie kontaktiere ich den QuickXchange-Support?` |
| 2330 | `Wie QuickXchange funktioniert &#124; QuickXchange` |
| 2332 | `Auftragsbestätigung · QuickXchange` |
| 2336 | `Was macht QuickXchange anders?` |
| 2452 | `Dieses Telegram-Konto ist bereits mit einem anderen QuickXchange-Konto verknüpft. Wenn Sie glauben, dass dies ein Fehler ist, wenden Sie sich bitte an den QuickXchange-Support.` |
| 2457 | `Benutzerhandbuch &#124; QuickXchange` |
| 2458 | `Folgen Sie dem QuickXchange-Benutzerhandbuch für eine Schritt-für-Schritt-Anleitung zu Krypto-Swaps, Konvertierungen, Auftragsfinanzierung, Tracking, Kontotools und Börsensicherheit.` |
| 2460 | `QuickXchange Benutzerhandbuch` |
| 2531 | `QuickXchange-Rechnung wird vorbereitet` |
| 2649 | `customer.quickxchangeUpdates` |
| 2649 | `QuickXchange-Updates` |

**`lib/i18n/src/completed/es.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `QuickXchange` |
| 66 | `Canales comunitarios oficiales de QuickXChange` |
| 76 | `Pantalla de conversión de QuickXchange que muestra selectores de criptomonedas y elección de tasa flotante` |
| 84 | `Comparta su experiencia con QuickXchange` |
| 102 | `Vincular cuenta de QuickXchange` |
| 114 | `Abra el bot oficial de Telegram de QuickXchange y presione Iniciar.` |
| 118 | `QuickXchange &mdash; Todos los derechos reservados.` |
| 122 | `ID de pedido de QuickXchange` |
| 127 | `Intercambie criptomonedas, cree y rastree pedidos, y obtenga soporte directamente desde Telegram: rápido, simple y siempre conectado a QuickXchange.` |
| 195 | `Intercambie con QuickXchange en Telegram` |
| 245 | `QuickXchange ofrece dos recorridos de intercambio distintos adaptados a sus necesidades. Elegir el correcto garantiza una transacción fluida.` |
| 276 | `Explore las rutas de conversión de criptomonedas habilitadas y continúe con su par seleccionado en el flujo de QuickXchange Convert.` |
| 350 | `Cómo funciona QuickXchange` |
| 381 | `Explore las rutas de conversión de QuickXchange disponibles, filtre pares de criptomonedas y continúe con el par seleccionado en el widget de conversión.` |
| 385 | `QuickXchange ofrece un programa de afiliados para usuarios que deseen invitar a otros a la plataforma.` |
| 401 | `Introduzca su ID de pedido de QuickXchange para ver el estado más reciente y los detalles de la transacción.` |
| 440 | `Seguir a QuickXChange` |
| 505 | `Vincule su cuenta de QuickXchange para administrar sus pedidos de forma segura en todas las plataformas.` |
| 553 | `Pantalla de intercambio de QuickXchange que muestra los selectores de Envías y Recibes` |
| 568 | `Sigue a QuickXChange en {{v0}}` |
| 573 | `👋 ¡Bienvenido a QuickXchange!` |
| 574 | `Elija una ruta activa popular y continúe directamente en el widget de QuickXchange.` |
| 575 | `Página de seguimiento de pedidos de QuickXchange con un campo de ID de pedido y un botón de Seguimiento de pedido` |
| 576 | `Su cuenta de QuickXchange ya está conectada a Telegram. Puede volver a Telegram para continuar.` |
| 580 | `Bienvenido a QuickXchange. Presione Inicio para abrir el menú del bot.` |
| 587 | `¿Necesita ayuda con un pedido o tiene preguntas sobre QuickXchange? Nuestro equipo está aquí para ayudarle.` |
| 611 | `QuickXchange toma medidas destinadas a reducir el riesgo de que sus servicios sean utilizados para lavado de dinero, financiamiento del terrorismo, fraude, evasión de sanciones u otra actividad prohibida.` |
| 647 | `Enviar correo al soporte de QuickXchange` |
| 668 | `QuickXchangeBot` |
| 678 | `Bienvenido al manual del usuario de QuickXchange. Esta guía proporciona instrucciones paso a paso para navegar por la plataforma de intercambio. Ya sea que utilice una ruta de intercambio manual admitida o una ruta de conversión automatizada de cripto a cripto, utilice este documento para comprender cada etapa antes de enviar fondos.` |
| 681 | `Pares de criptomonedas &#124; QuickXchange` |
| 697 | `Puede encontrarlo en su confirmación de pedido de QuickXchange o en Mis pedidos cuando haya iniciado sesión.` |
| 713 | `Tómese un momento extra para verificar dos veces las direcciones de destino y de reembolso. Las transacciones de blockchain son irreversibles. QuickXchange no puede recuperar los fondos enviados a direcciones incorrectas.` |
| 772 | `Cuenta de QuickXchange` |
| 795 | `Gracias, te has suscrito a las actualizaciones de QuickXchange.` |
| 809 | `Filtra las rutas de conversión habilitadas publicadas por QuickXchange.` |
| 818 | `Promociona QuickXchange entre tus afiliados y enséñales a realizar intercambios entre métodos de pago. Gana el 30% de las comisiones de sus pedidos.` |
| 841 | `Contacta con el soporte de QuickXchange en Telegram` |
| 849 | `Bienvenido a QuickXchange` |
| 864 | `Abrir el bot de QuickXchange` |
| 885 | `QuickXchange está diseñado para ser utilizado de forma segura dentro de Telegram. Por favor, abra el bot para acceder a su cuenta.` |
| 940 | `Política de verificación de identidad y AML &#124; QuickXchange` |
| 941 | `Lea la política de QuickXchange sobre verificación de identidad, origen de fondos, revisión de transacciones y lucha contra el blanqueo de capitales.` |
| 942 | `La Política AML establece los principios que QuickXchange aplica a la verificación de identidad, la comprobación del origen de los fondos, la revisión de transacciones sospechosas, la cooperación de los usuarios y las solicitudes legales de información. Se aplica a los usuarios y transacciones en los que se requiere verificación o revisión exhaustiva.` |
| 972 | `Este aviso para QuickXchange ("Empresa", "nosotros", "nos" o "nuestro") describe cómo y por qué podemos recopilar, almacenar, usar y/o compartir ("procesar") su información cuando utiliza nuestros Servicios, como cuando visita la plataforma QuickXchange u otra plataforma nuestra vinculada a este aviso, o cuando interactúa con nosotros de otras maneras relacionadas, incluyendo ventas, marketing o eventos. ¿Preguntas o inquietudes? Leer este aviso le ayudará a entender sus derechos y opciones.` |
| 976 | `Cuando visita, utiliza o navega por nuestros Servicios, podemos procesar información personal dependiendo de cómo interactúe con QuickXchange y los Servicios, las decisiones que tome y los productos y funciones que utilice.` |
| 990 | `Recopilamos información personal que usted proporciona voluntariamente al registrarse en los Servicios, solicitar información sobre nuestros productos o servicios, participar en actividades en los Servicios, completar una transacción o contactarnos. La información que recopilamos depende de sus interacciones con QuickXchange, las decisiones que toma y los productos y funciones que utiliza. Puede incluir su nombre, número de teléfono, dirección de correo electrónico, nombre de usuario, detalles de facturación e información de pago o billetera necesaria para una ruta de transacción seleccionada. Toda la información personal que proporcione debe ser verdadera, completa y precisa, y debe notificarnos sobre cambios relevantes.` |
| 2288 | `QuickXchange Editorial` |
| 2290 | `Inteligencia de mercado &#124; QuickXchange` |
| 2292 | `¿Qué es QuickXchange?` |
| 2293 | `QuickXchange es un intercambio de criptomonedas guiado diseñado para proporcionar información clara sobre la ruta, el pago, la transferencia y el pedido antes de que actúe.` |
| 2294 | `El intercambio (Swap) utiliza rutas configuradas de QuickXchange y detalles de liquidación/pago guiados. La conversión (Convert) utiliza rutas de conversión de proveedores compatibles cuando están disponibles.` |
| 2307 | `Las transferencias a través de una red incorrecta podrían no ser recuperables. Contacte con el soporte de QuickXchange con los detalles de su pedido y el TXID para que la transferencia pueda ser revisada, sin asumir que la recuperación sea posible.` |
| 2315 | `Revise la cotización y los detalles del pedido para ver las comisiones aplicadas a la ruta seleccionada. QuickXchange no asume comisiones que no se muestren en dichos detalles.` |
| 2322 | `¿Cómo contacto con el soporte de QuickXchange?` |
| 2323 | `Cómo funciona QuickXchange &#124; QuickXchange` |
| 2325 | `Confirmación de pedido · QuickXchange` |
| 2329 | `¿Qué hace diferente a QuickXchange?` |
| 2445 | `Esta cuenta de Telegram ya está conectada a otra cuenta de QuickXchange. Si cree que esto es un error, contacte con el soporte de QuickXchange.` |
| 2450 | `Manual del usuario &#124; QuickXchange` |
| 2451 | `Siga el manual del usuario de QuickXchange para obtener orientación paso a paso sobre intercambios de criptomonedas, conversiones, financiación de órdenes, seguimiento, herramientas de cuenta y seguridad del intercambio.` |
| 2453 | `Manual del usuario de QuickXchange` |
| 2524 | `Preparando factura de QuickXchange` |
| 2642 | `customer.quickxchangeUpdates` |
| 2642 | `Actualizaciones de QuickXchange` |

**`lib/i18n/src/completed/fr.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `QuickXchange` |
| 79 | `Chaînes communautaires officielles de QuickXChange` |
| 89 | `Écran de conversion QuickXchange affichant les sélecteurs de crypto et le choix de taux flottant` |
| 97 | `Partagez votre expérience avec QuickXchange` |
| 115 | `Lier un compte QuickXchange` |
| 127 | `Ouvrez le bot Telegram officiel de QuickXchange et appuyez sur Démarrer.` |
| 131 | `QuickXchange &mdash; Tous droits réservés.` |
| 135 | `ID de commande QuickXchange` |
| 140 | `Échangez des cryptos, créez et suivez vos commandes, et obtenez de l'aide directement depuis Telegram — rapide, simple et toujours connecté à QuickXchange.` |
| 208 | `Échangez avec QuickXchange sur Telegram` |
| 258 | `QuickXchange propose deux parcours d'échange distincts adaptés à vos besoins. Choisir le bon garantit une transaction fluide.` |
| 289 | `Parcourez les itinéraires de conversion crypto activés et continuez avec la paire sélectionnée dans le flux QuickXchange Convert.` |
| 363 | `Comment fonctionne QuickXchange` |
| 394 | `Parcourez les itinéraires de conversion QuickXchange disponibles, filtrez les paires crypto et continuez avec la paire sélectionnée dans le widget de conversion.` |
| 398 | `QuickXchange propose un programme d'affiliation pour les utilisateurs souhaitant inviter d'autres personnes sur la plateforme.` |
| 414 | `Entrez votre ID de commande QuickXchange pour voir le statut actuel et les détails de la transaction.` |
| 453 | `Suivre QuickXChange` |
| 518 | `Liez votre compte QuickXchange pour gérer vos commandes en toute sécurité sur toutes les plateformes.` |
| 566 | `Écran de swap QuickXchange montrant les sélecteurs Vous envoyez et Vous recevez` |
| 581 | `Suivez QuickXChange sur {{v0}}` |
| 586 | `👋 Bienvenue sur QuickXchange !` |
| 587 | `Choisissez un itinéraire actif populaire et continuez directement dans le widget QuickXchange.` |
| 588 | `Page de suivi de commande QuickXchange avec un champ ID de commande et un bouton Suivre la commande` |
| 589 | `Votre compte QuickXchange est maintenant connecté à Telegram. Vous pouvez retourner sur Telegram pour continuer.` |
| 593 | `Bienvenue sur QuickXchange. Appuyez sur Démarrer pour ouvrir le menu du bot.` |
| 600 | `Besoin d'aide avec une commande ou des questions sur QuickXchange ? Notre équipe est là pour vous aider.` |
| 624 | `QuickXchange prend des mesures destinées à réduire le risque que ses services soient utilisés pour le blanchiment d'argent, le financement du terrorisme, la fraude, le contournement des sanctions ou toute autre activité interdite.` |
| 660 | `Envoyer un e-mail au support QuickXchange` |
| 681 | `QuickXchangeBot` |
| 691 | `Bienvenue dans le manuel d'utilisation de QuickXchange. Ce guide fournit des instructions étape par étape pour naviguer sur la plateforme d'échange. Que vous utilisiez une route d'échange manuelle prise en charge ou une route de conversion crypto-à-crypto automatisée, utilisez ce document pour comprendre chaque étape avant de soumettre des fonds.` |
| 694 | `Paires crypto &#124; QuickXchange` |
| 710 | `Vous pouvez le trouver dans votre confirmation de commande QuickXchange ou dans Mes commandes lorsque vous êtes connecté.` |
| 726 | `Prenez un instant supplémentaire pour vérifier les adresses de destination et de remboursement. Les transactions blockchain sont irréversibles. QuickXchange ne peut pas récupérer les fonds envoyés à des adresses incorrectes.` |
| 785 | `Compte QuickXchange` |
| 808 | `Merci — vous êtes abonné aux mises à jour de QuickXchange.` |
| 822 | `Filtrez les itinéraires de conversion activés publiés par QuickXchange.` |
| 831 | `Faites la promotion de QuickXchange auprès de vos affiliés et apprenez-leur à échanger entre les méthodes de paiement. Gagnez 30 % des frais sur leurs commandes.` |
| 854 | `Contactez le support QuickXchange sur Telegram` |
| 862 | `Bienvenue sur QuickXchange` |
| 877 | `Ouvrir le bot QuickXchange` |
| 898 | `QuickXchange est conçu pour être utilisé en toute sécurité dans Telegram. Veuillez ouvrir le bot pour accéder à votre compte.` |
| 953 | `Politique de vérification d'identité et AML &#124; QuickXchange` |
| 954 | `Lisez la politique de QuickXchange en matière de vérification d'identité, de source de fonds, d'examen des transactions et de lutte contre le blanchiment d'argent.` |
| 955 | `La politique AML établit les principes que QuickXchange applique à la vérification d'identité, aux contrôles de la source des fonds, à l'examen des transactions suspectes, à la coopération des utilisateurs et aux demandes d'informations légales. Elle s'applique aux utilisateurs et aux transactions pour lesquels une vérification ou un examen approfondi est requis.` |
| 985 | `Cet avis pour QuickXchange (« Société », « nous », « notre » ou « nos ») décrit comment et pourquoi nous pouvons collecter, stocker, utiliser et/ou partager (« traiter ») vos informations lorsque vous utilisez nos Services, par exemple lorsque vous visitez la plateforme QuickXchange ou une autre de nos plateformes liée à cet avis, ou lorsque vous interagissez avec nous de toute autre manière connexe, y compris pour des ventes, du marketing ou des événements. Des questions ou des préoccupations ? La lecture de cet avis vous aidera à comprendre vos droits et vos choix.` |
| 989 | `Lorsque vous visitez, utilisez ou naviguez sur nos Services, nous pouvons traiter des informations personnelles en fonction de la manière dont vous interagissez avec QuickXchange et les Services, des choix que vous faites et des produits et fonctionnalités que vous utilisez.` |
| 1003 | `Nous collectons des informations personnelles que vous fournissez volontairement lorsque vous vous inscrivez aux Services, demandez des informations sur nos produits ou services, participez à des activités sur les Services, effectuez une transaction ou nous contactez. Les informations que nous collectons dépendent de vos interactions avec QuickXchange, des choix que vous faites et des produits et fonctionnalités que vous utilisez. Elles peuvent inclure votre nom, numéro de téléphone, adresse e-mail, nom d'utilisateur, détails de facturation, et des informations de paiement ou de portefeuille nécessaires pour un itinéraire de transaction sélectionné. Toutes les informations personnelles que vous fournissez doivent être vraies, complètes et exactes, et vous devez nous informer des changements pertinents.` |
| 2301 | `QuickXchange Editorial` |
| 2303 | `Intelligence de marché &#124; QuickXchange` |
| 2305 | `Qu'est-ce que QuickXchange ?` |
| 2306 | `QuickXchange est un échange crypto guidé conçu pour fournir des informations claires sur l'itinéraire, le paiement, le transfert et la commande avant que vous n'agissiez.` |
| 2307 | `L'échange (Swap) utilise des itinéraires QuickXchange configurés et des détails de règlement/paiement guidés. La conversion (Convert) utilise des itinéraires de conversion de fournisseurs pris en charge lorsque cela est possible.` |
| 2320 | `Les transferts sur un mauvais réseau peuvent ne pas être récupérables. Contactez le support de QuickXchange avec vos détails de commande et votre TXID afin que le transfert puisse être examiné, sans toutefois garantir une récupération possible.` |
| 2328 | `Consultez le devis et les détails de la commande pour connaître les frais appliqués à l'itinéraire sélectionné. QuickXchange ne prend pas en charge les frais qui ne sont pas indiqués dans ces détails.` |
| 2335 | `Comment contacter le support de QuickXchange ?` |
| 2336 | `Comment fonctionne QuickXchange &#124; QuickXchange` |
| 2338 | `Confirmation de commande · QuickXchange` |
| 2342 | `Qu'est-ce qui rend QuickXchange différent ?` |
| 2458 | `Ce compte Telegram est déjà connecté à un autre compte QuickXchange. Si vous pensez qu'il s'agit d'une erreur, contactez le support de QuickXchange.` |
| 2463 | `Manuel de l'utilisateur &#124; QuickXchange` |
| 2464 | `Suivez le manuel de l'utilisateur de QuickXchange pour obtenir des conseils étape par étape sur les échanges de crypto, les conversions, le financement des ordres, le suivi, les outils de compte et la sécurité des échanges.` |
| 2466 | `Manuel de l'utilisateur QuickXchange` |
| 2537 | `Préparation de la facture QuickXchange` |
| 2655 | `customer.quickxchangeUpdates` |
| 2655 | `Mises à jour QuickXchange` |

**`lib/i18n/src/completed/ko.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `QuickXchange` |
| 59 | `QuickXChange 공식 커뮤니티 채널` |
| 69 | `암호화폐 선택기와 변동 환율 선택이 표시되는 QuickXchange 변환 화면` |
| 77 | `QuickXchange 경험을 공유하세요` |
| 95 | `QuickXchange 계정 연결` |
| 107 | `공식 QuickXchange 텔레그램 봇을 열고 시작을 누르세요.` |
| 111 | `QuickXchange &mdash; 모든 권리 보유.` |
| 115 | `QuickXchange 주문 ID` |
| 120 | `Telegram에서 직접 암호화폐를 교환하고 주문을 생성 및 추적하며 지원을 받으세요. 빠르고 간단하며 항상 QuickXchange와 연결되어 있습니다.` |
| 188 | `Telegram에서 QuickXchange으로 교환하세요` |
| 238 | `QuickXchange는 귀하의 필요에 맞춘 두 가지 독특한 교환 여정을 제공합니다. 올바른 것을 선택하면 원활한 거래가 보장됩니다.` |
| 269 | `활성화된 암호화폐 변환 경로를 탐색하고 QuickXchange Convert 흐름에서 선택한 쌍으로 계속 진행하세요.` |
| 343 | `QuickXchange 작동 방식` |
| 374 | `사용 가능한 QuickXchange 전환 경로를 탐색하고 암호화폐 쌍을 필터링한 후 전환 위젯에서 선택한 쌍으로 계속 진행하십시오.` |
| 378 | `QuickXchange는 플랫폼에 다른 사람을 초대하려는 사용자를 위한 제휴 프로그램을 제공합니다.` |
| 394 | `최신 상태와 거래 내역을 확인하려면 QuickXchange 주문 ID를 입력하세요.` |
| 433 | `QuickXChange 팔로우하기` |
| 498 | `여러 플랫폼에서 주문을 안전하게 관리하려면 QuickXchange 계정을 연결하세요.` |
| 546 | `보내는 항목과 받는 항목 선택기가 표시된 QuickXchange 스왑 화면` |
| 561 | `{{v0}}에서 QuickXChange 팔로우하기` |
| 566 | `👋 QuickXchange에 오신 것을 환영합니다!` |
| 567 | `인기 있는 활성 경로를 선택하고 QuickXchange 위젯에서 바로 진행하세요.` |
| 568 | `주문 ID 필드와 주문 추적 버튼이 있는 QuickXchange 주문 추적 페이지` |
| 569 | `귀하의 QuickXchange 계정이 Telegram에 연결되었습니다. Telegram으로 돌아가 계속 진행할 수 있습니다.` |
| 573 | `QuickXchange에 오신 것을 환영합니다. 시작을 눌러 봇 메뉴를 여세요.` |
| 580 | `주문과 관련하여 도움이 필요하거나 QuickXchange에 대해 궁금한 점이 있으신가요? 저희 팀이 도와드리겠습니다.` |
| 604 | `QuickXchange는 서비스가 자금 세탁, 테러 자금 조달, 사기, 제재 회피 또는 기타 금지된 활동에 사용될 위험을 줄이기 위한 조치를 취합니다.` |
| 640 | `QuickXchange 지원팀에 이메일 보내기` |
| 661 | `QuickXchangeBot` |
| 671 | `QuickXchange 사용자 매뉴얼에 오신 것을 환영합니다. 이 가이드는 거래 플랫폼 탐색을 위한 단계별 지침을 제공합니다. 지원되는 수동 스왑 경로를 사용하든 자동화된 암호화폐 간 변환 경로를 사용하든, 자금을 제출하기 전에 이 문서를 사용하여 각 단계를 이해하십시오.` |
| 674 | `암호화폐 쌍 &#124; QuickXchange` |
| 690 | `QuickXchange 주문 확인서에서 찾거나 로그인한 후 내 주문에서 확인할 수 있습니다.` |
| 706 | `목적지 주소와 환불 주소를 다시 한 번 확인해 주세요. 블록체인 거래는 되돌릴 수 없습니다. QuickXchange는 잘못된 주소로 보낸 자금을 복구할 수 없습니다.` |
| 765 | `QuickXchange 계정` |
| 788 | `감사합니다 — QuickXchange 업데이트를 구독하셨습니다.` |
| 802 | `QuickXchange에서 게시한 활성화된 변환 경로를 필터링하세요.` |
| 811 | `귀하의 제휴사들 사이에서 QuickXchange를 홍보하고 결제 수단 간 교환 방법을 알려주세요. 그들의 주문 수수료에서 30%를 적립하세요.` |
| 834 | `Telegram에서 QuickXchange 지원팀에 문의하세요` |
| 842 | `QuickXchange에 오신 것을 환영합니다` |
| 857 | `QuickXchange 봇 열기` |
| 878 | `QuickXchange는 Telegram 내에서 안전하게 사용할 수 있도록 설계되었습니다. 계정에 액세스하려면 봇을 여십시오.` |
| 933 | `신원 확인 및 AML 정책 &#124; QuickXchange` |
| 934 | `QuickXchange의 신원 확인, 자금 출처, 거래 검토 및 자금 세탁 방지 정책을 읽어보십시오.` |
| 935 | `AML 정책은 QuickXchange가 신원 확인, 자금 출처 확인, 의심스러운 거래 검토, 사용자 협조 및 법적 정보 요청에 적용하는 원칙을 명시합니다. 이 정책은 확인 또는 강화된 검토가 필요한 사용자와 거래에 적용됩니다.` |
| 965 | `QuickXchange(이하 "회사", "우리", "우리의")를 위한 이 공지는 귀하가 당사 서비스를 이용할 때, 예를 들어 QuickXchange 플랫폼 또는 이 공지와 연결된 당사의 다른 플랫폼을 방문하거나, 영업, 마케팅 또는 이벤트를 포함한 다른 관련 방식으로 당사와 교류할 때 당사가 어떻게 그리고 왜 귀하의 정보를 수집, 저장, 사용 및/또는 공유("처리")하는지 설명합니다. 질문이나 우려 사항이 있으신가요? 이 공지를 읽으면 귀하의 권리와 선택 사항을 이해하는 데 도움이 될 것입니다.` |
| 969 | `귀하가 당사 서비스를 방문, 사용 또는 탐색할 때, 당사는 귀하가 QuickXchange 및 서비스와 상호 작용하는 방식, 귀하가 내리는 선택, 그리고 귀하가 사용하는 제품 및 기능에 따라 개인 정보를 처리할 수 있습니다.` |
| 983 | `당사는 귀하가 서비스에 등록하거나, 당사 제품 또는 서비스에 대한 정보를 요청하거나, 서비스 내 활동에 참여하거나, 거래를 완료하거나, 당사에 연락할 때 귀하가 자발적으로 제공하는 개인 정보를 수집합니다. 당사가 수집하는 정보는 귀하가 QuickXchange와 상호 작용하는 방식, 귀하의 선택, 귀하가 사용하는 제품 및 기능에 따라 다릅니다. 여기에는 귀하의 이름, 전화번호, 이메일 주소, 사용자 이름, 청구 세부 정보, 그리고 선택된 거래 경로에 필요한 결제 또는 지갑 정보가 포함될 수 있습니다. 귀하가 제공하는 모든 개인 정보는 진실되고 완전하며 정확해야 하며, 관련 변경 사항이 있는 경우 당사에 알려야 합니다.` |
| 2281 | `QuickXchange Editorial` |
| 2283 | `시장 정보 &#124; QuickXchange` |
| 2285 | `QuickXchange란 무엇인가요?` |
| 2286 | `QuickXchange는 행동하기 전에 경로, 결제, 이체 및 주문 정보를 명확하게 제공하도록 설계된 가이드 암호화폐 거래소입니다.` |
| 2287 | `스왑(Swap)은 구성된 QuickXchange 경로와 가이드 결제/지불 세부 정보를 사용합니다. 변환(Convert)은 사용 가능한 경우 지원되는 제공업체의 변환 경로를 사용합니다.` |
| 2300 | `잘못된 네트워크를 통한 전송은 복구가 불가능할 수 있습니다. 주문 상세 정보와 TXID를 가지고 QuickXchange 고객 지원팀에 문의하여 전송 내역을 검토받으십시오. 단, 복구가 가능하다는 보장은 없습니다.` |
| 2308 | `선택한 경로에 적용되는 수수료는 견적 및 주문 상세 정보를 확인하십시오. QuickXchange는 해당 상세 정보에 표시되지 않은 수수료에 대해서는 책임지지 않습니다.` |
| 2315 | `QuickXchange 고객 지원팀에 어떻게 연락하나요?` |
| 2316 | `QuickXchange 작동 방식 &#124; QuickXchange` |
| 2318 | `주문 확인 · QuickXchange` |
| 2322 | `QuickXchange가 차별화되는 점은 무엇인가요?` |
| 2438 | `이 Telegram 계정은 이미 다른 QuickXchange 계정에 연결되어 있습니다. 오류라고 생각되면 QuickXchange 고객 지원팀에 문의하세요.` |
| 2443 | `사용자 매뉴얼 &#124; QuickXchange` |
| 2444 | `암호화폐 스왑, 변환, 주문 자금 조달, 추적, 계정 도구 및 거래 안전에 대한 단계별 안내는 QuickXchange 사용자 매뉴얼을 따르세요.` |
| 2446 | `QuickXchange 사용자 매뉴얼` |
| 2517 | `QuickXchange 청구서 준비 중` |
| 2635 | `customer.quickxchangeUpdates` |
| 2635 | `QuickXchange 업데이트` |

**`lib/i18n/src/completed/ru.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `QuickXchange` |
| 60 | `Официальные сообщества QuickXChange` |
| 70 | `Экран конвертации QuickXchange с выбором криптовалют и плавающего курса` |
| 78 | `Поделитесь своим опытом работы с QuickXchange` |
| 96 | `Привязать аккаунт QuickXchange` |
| 108 | `Откройте официального Telegram-бота QuickXchange и нажмите «Старт».` |
| 112 | `QuickXchange &mdash; Все права защищены.` |
| 116 | `ID заказа QuickXchange` |
| 121 | `Обменивайте криптовалюту, создавайте и отслеживайте заказы, а также получайте поддержку прямо из Telegram — быстро, просто и всегда на связи с QuickXchange.` |
| 189 | `Обменивайте с QuickXchange в Telegram` |
| 239 | `QuickXchange предлагает два различных пути обмена, адаптированных под ваши нужды. Выбор подходящего варианта гарантирует успешную транзакцию.` |
| 270 | `Просматривайте доступные маршруты конвертации криптовалют и продолжите с выбранной парой в потоке QuickXchange Convert.` |
| 344 | `Как работает QuickXchange` |
| 375 | `Просматривайте доступные маршруты конвертации QuickXchange, фильтруйте криптопары и продолжайте работу с выбранной парой в виджете конвертации.` |
| 379 | `QuickXchange предоставляет партнерскую программу для пользователей, которые хотят пригласить других на платформу.` |
| 395 | `Введите ID заказа QuickXchange, чтобы увидеть актуальный статус и детали транзакции.` |
| 434 | `Подписаться на QuickXChange` |
| 499 | `Привяжите свой аккаунт QuickXchange для безопасного управления заказами на разных платформах.` |
| 547 | `Экран обмена QuickXchange, показывающий селекторы «Вы отправляете» и «Вы получаете»` |
| 562 | `Следите за QuickXChange в {{v0}}` |
| 567 | `👋 Добро пожаловать в QuickXchange!` |
| 568 | `Выберите популярный активный маршрут и продолжите работу прямо в виджете QuickXchange.` |
| 569 | `Страница отслеживания заказа QuickXchange с полем ID заказа и кнопкой «Отследить заказ»` |
| 570 | `Ваш аккаунт QuickXchange теперь подключен к Telegram. Вы можете вернуться в Telegram, чтобы продолжить.` |
| 574 | `Добро пожаловать в QuickXchange. Нажмите «Старт», чтобы открыть меню бота.` |
| 581 | `Нужна помощь с заказом или есть вопросы о QuickXchange? Наша команда готова помочь.` |
| 605 | `QuickXchange принимает меры для снижения риска использования своих услуг в целях отмывания денег, финансирования терроризма, мошенничества, обхода санкций или другой запрещенной деятельности.` |
| 641 | `Написать в службу поддержки QuickXchange` |
| 662 | `QuickXchangeBot` |
| 672 | `Добро пожаловать в руководство пользователя QuickXchange. Это руководство содержит пошаговые инструкции по работе с платформой обмена. Независимо от того, используете ли вы поддерживаемый ручной маршрут обмена или автоматизированный маршрут конвертации криптовалют, используйте этот документ, чтобы понять каждый этап перед отправкой средств.` |
| 675 | `Криптовалютные пары &#124; QuickXchange` |
| 691 | `Вы можете найти его в подтверждении заказа QuickXchange или в разделе «Мои заказы» после входа в систему.` |
| 707 | `Уделите дополнительную минуту, чтобы еще раз проверить адреса получателя и возврата средств. Блокчейн-транзакции необратимы. QuickXchange не может вернуть средства, отправленные на неверные адреса.` |
| 766 | `Аккаунт QuickXchange` |
| 789 | `Спасибо — вы подписались на обновления QuickXchange.` |
| 803 | `Отфильтруйте доступные маршруты конвертации, опубликованные QuickXchange.` |
| 812 | `Продвигайте QuickXchange среди своих партнеров и научите их обменивать валюту между способами оплаты. Зарабатывайте 30% от комиссий с их заказов.` |
| 835 | `Свяжитесь с поддержкой QuickXchange в Telegram` |
| 843 | `Добро пожаловать в QuickXchange` |
| 858 | `Открыть бота QuickXchange` |
| 879 | `QuickXchange разработан для безопасного использования внутри Telegram. Пожалуйста, откройте бота, чтобы получить доступ к своему аккаунту.` |
| 934 | `Политика верификации личности и AML &#124; QuickXchange` |
| 935 | `Ознакомьтесь с политикой QuickXchange в отношении верификации личности, происхождения средств, проверки транзакций и борьбы с отмыванием денег.` |
| 936 | `Политика AML устанавливает принципы, которые QuickXchange применяет к верификации личности, проверке происхождения средств, рассмотрению подозрительных транзакций, сотрудничеству с пользователями и законным запросам информации. Она распространяется на пользователей и транзакции, требующие верификации или расширенной проверки.` |
| 966 | `Данное уведомление для QuickXchange («Компания», «мы», «нас» или «наш») описывает, как и почему мы можем собирать, хранить, использовать и/или передавать («обрабатывать») вашу информацию, когда вы пользуетесь нашими Сервисами, например, когда вы посещаете платформу QuickXchange или другую нашу платформу, связанную с этим уведомлением, или взаимодействуете с нами иным образом, включая продажи, маркетинг или мероприятия. Есть вопросы или сомнения? Ознакомление с этим уведомлением поможет вам понять ваши права и варианты выбора.` |
| 970 | `Когда вы посещаете, используете или перемещаетесь по нашим Сервисам, мы можем обрабатывать персональную информацию в зависимости от того, как вы взаимодействуете с QuickXchange и Сервисами, какой выбор вы делаете, а также от используемых вами продуктов и функций.` |
| 984 | `Мы собираем персональную информацию, которую вы добровольно предоставляете при регистрации в Сервисах, запросе информации о наших продуктах или услугах, участии в мероприятиях на Сервисах, совершении транзакции или обращении к нам. Информация, которую мы собираем, зависит от вашего взаимодействия с QuickXchange, вашего выбора, а также продуктов и функций, которые вы используете. Она может включать ваше имя, номер телефона, адрес электронной почты, имя пользователя, платежные реквизиты, а также информацию о платежах или кошельке, необходимую для выбранного маршрута транзакции. Вся предоставленная вами персональная информация должна быть правдивой, полной и точной, и вы должны сообщать нам о соответствующих изменениях.` |
| 2282 | `QuickXchange Editorial` |
| 2284 | `Анализ рынка &#124; QuickXchange` |
| 2286 | `Что такое QuickXchange?` |
| 2287 | `QuickXchange — это управляемая криптобиржа, созданная для предоставления четкой информации о маршруте, оплате, переводе и заказе перед совершением действий.` |
| 2288 | `Обмен (Swap) использует настроенные маршруты QuickXchange и управляемые детали расчетов/платежей. Конвертация (Convert) использует поддерживаемые маршруты конвертации провайдеров, если они доступны.` |
| 2301 | `Переводы в неверной сети могут быть невозвратны. Свяжитесь со службой поддержки QuickXchange, указав детали заказа и TXID для проверки перевода, при этом возможность восстановления не гарантируется.` |
| 2309 | `Ознакомьтесь с курсом и деталями заказа, чтобы узнать о комиссиях для выбранного направления. QuickXchange не несет ответственности за комиссии, не указанные в этих деталях.` |
| 2316 | `Как связаться со службой поддержки QuickXchange?` |
| 2317 | `Как работает QuickXchange &#124; QuickXchange` |
| 2319 | `Подтверждение заказа · QuickXchange` |
| 2323 | `Что отличает QuickXchange?` |
| 2439 | `Эта учетная запись Telegram уже привязана к другому аккаунту QuickXchange. Если вы считаете, что это ошибка, обратитесь в службу поддержки QuickXchange.` |
| 2444 | `Руководство пользователя &#124; QuickXchange` |
| 2445 | `Следуйте руководству пользователя QuickXchange для пошагового обучения по обмену криптовалют, конвертации, финансированию ордеров, отслеживанию, инструментам аккаунта и безопасности обмена.` |
| 2447 | `Руководство пользователя QuickXchange` |
| 2518 | `Подготовка счета QuickXchange` |
| 2636 | `customer.quickxchangeUpdates` |
| 2636 | `Обновления QuickXchange` |

**`lib/i18n/src/completed/uk.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `QuickXchange` |
| 60 | `Офіційні спільноти QuickXChange` |
| 70 | `Екран конвертації QuickXchange з вибором криптовалют та плаваючого курсу` |
| 78 | `Поділіться своїм досвідом роботи з QuickXchange` |
| 96 | `Прив'язати акаунт QuickXchange` |
| 108 | `Відкрийте офіційного Telegram-бота QuickXchange та натисніть «Старт».` |
| 112 | `QuickXchange &mdash; Усі права захищено.` |
| 116 | `ID замовлення QuickXchange` |
| 121 | `Обмінюйте криптовалюту, створюйте та відстежуйте замовлення, а також отримуйте підтримку безпосередньо з Telegram — швидко, просто та завжди на зв'язку з QuickXchange.` |
| 189 | `Обмінюйте з QuickXchange у Telegram` |
| 239 | `QuickXchange пропонує два різні шляхи обміну, адаптовані до ваших потреб. Вибір правильного варіанту гарантує успішну транзакцію.` |
| 270 | `Переглядайте доступні маршрути конвертації криптовалют і продовжуйте з обраною парою у потоці QuickXchange Convert.` |
| 344 | `Як працює QuickXchange` |
| 375 | `Переглядайте доступні маршрути конвертації QuickXchange, фільтруйте криптопари та продовжуйте роботу з вибраною парою у віджеті конвертації.` |
| 379 | `QuickXchange пропонує партнерську програму для користувачів, які бажають запросити інших на платформу.` |
| 395 | `Введіть ID замовлення QuickXchange, щоб побачити актуальний статус і деталі транзакції.` |
| 434 | `Стежити за QuickXChange` |
| 499 | `Прив'яжіть свій акаунт QuickXchange для безпечного керування замовленнями на різних платформах.` |
| 547 | `Екран обміну QuickXchange, що відображає селектори «Ви надсилаєте» та «Ви отримуєте»` |
| 562 | `Слідкуйте за QuickXChange у {{v0}}` |
| 567 | `👋 Ласкаво просимо до QuickXchange!` |
| 568 | `Виберіть популярний активний маршрут і продовжуйте безпосередньо у віджеті QuickXchange.` |
| 569 | `Сторінка відстеження замовлення QuickXchange з полем ID замовлення та кнопкою «Відстежити замовлення»` |
| 570 | `Ваш обліковий запис QuickXchange тепер підключено до Telegram. Ви можете повернутися до Telegram, щоб продовжити.` |
| 574 | `Ласкаво просимо до QuickXchange. Натисніть «Старт», щоб відкрити меню бота.` |
| 581 | `Потрібна допомога із замовленням чи є запитання щодо QuickXchange? Наша команда готова допомогти.` |
| 605 | `QuickXchange вживає заходів, спрямованих на зменшення ризику використання своїх послуг для відмивання грошей, фінансування тероризму, шахрайства, обходу санкцій або іншої забороненої діяльності.` |
| 641 | `Написати в службу підтримки QuickXchange` |
| 662 | `QuickXchangeBot` |
| 672 | `Ласкаво просимо до посібника користувача QuickXchange. Цей посібник містить покрокові інструкції щодо роботи з платформою обміну. Незалежно від того, чи використовуєте ви підтримуваний ручний маршрут обміну, чи автоматизований маршрут конвертації криптовалют, використовуйте цей документ, щоб зрозуміти кожен етап перед надсиланням коштів.` |
| 675 | `Криптовалютні пари &#124; QuickXchange` |
| 691 | `Ви можете знайти його в підтвердженні замовлення QuickXchange або в розділі «Мої замовлення» після входу в систему.` |
| 707 | `Витратьте зайву хвилину, щоб ще раз перевірити адреси отримувача та повернення коштів. Транзакції в блокчейні незворотні. QuickXchange не може повернути кошти, відправлені на неправильні адреси.` |
| 766 | `Акаунт QuickXchange` |
| 789 | `Дякуємо — ви підписалися на оновлення QuickXchange.` |
| 803 | `Відфільтруйте активовані маршрути конвертації, опубліковані QuickXchange.` |
| 812 | `Просувайте QuickXchange серед своїх партнерів і навчіть їх обмінювати валюту між способами оплати. Заробляйте 30% від комісій з їхніх замовлень.` |
| 835 | `Зв'яжіться з підтримкою QuickXchange в Telegram` |
| 843 | `Ласкаво просимо до QuickXchange` |
| 858 | `Відкрити бота QuickXchange` |
| 879 | `QuickXchange розроблено для безпечного використання всередині Telegram. Будь ласка, відкрийте бота, щоб отримати доступ до свого облікового запису.` |
| 934 | `Політика верифікації особи та AML &#124; QuickXchange` |
| 935 | `Ознайомтеся з політикою QuickXchange щодо верифікації особи, походження коштів, перевірки транзакцій та боротьби з відмиванням грошей.` |
| 936 | `Політика AML встановлює принципи, які QuickXchange застосовує до верифікації особи, перевірки походження коштів, розгляду підозрілих транзакцій, співпраці з користувачами та законних запитів на інформацію. Вона поширюється на користувачів і транзакції, де потрібна верифікація або поглиблена перевірка.` |
| 966 | `Це повідомлення для QuickXchange («Компанія», «ми», «нас» або «наш») описує, як і чому ми можемо збирати, зберігати, використовувати та/або передавати («обробляти») вашу інформацію, коли ви користуєтеся нашими Сервісами, наприклад, коли ви відвідуєте платформу QuickXchange або іншу нашу платформу, пов'язану з цим повідомленням, або взаємодієте з нами іншим чином, включаючи продажі, маркетинг або заходи. Маєте запитання чи занепокоєння? Ознайомлення з цим повідомленням допоможе вам зрозуміти ваші права та варіанти вибору.` |
| 970 | `Коли ви відвідуєте, використовуєте або переміщуєтеся нашими Сервісами, ми можемо обробляти персональну інформацію залежно від того, як ви взаємодієте з QuickXchange та Сервісами, який вибір ви робите, а також від продуктів і функцій, якими ви користуєтеся.` |
| 984 | `Ми збираємо персональну інформацію, яку ви добровільно надаєте під час реєстрації в Сервісах, запиту інформації про наші продукти чи послуги, участі в заходах на Сервісах, здійснення транзакції або звернення до нас. Інформація, яку ми збираємо, залежить від вашої взаємодії з QuickXchange, вашого вибору, а також від продуктів і функцій, якими ви користуєтеся. Вона може включати ваше ім'я, номер телефону, адресу електронної пошти, ім'я користувача, платіжні реквізити, а також інформацію про платежі чи гаманець, необхідну для вибраного маршруту транзакції. Уся надана вами персональна інформація повинна бути правдивою, повною та точною, і ви повинні повідомляти нам про відповідні зміни.` |
| 2282 | `QuickXchange Editorial` |
| 2284 | `Аналіз ринку &#124; QuickXchange` |
| 2286 | `Що таке QuickXchange?` |
| 2287 | `QuickXchange — це керована криптобіржа, створена для надання чіткої інформації про маршрут, оплату, переказ і замовлення перед виконанням дій.` |
| 2288 | `Обмін (Swap) використовує налаштовані маршрути QuickXchange та керовані деталі розрахунків/платежів. Конвертація (Convert) використовує підтримувані маршрути конвертації провайдерів, якщо вони доступні.` |
| 2301 | `Перекази через невірну мережу можуть бути незворотними. Зверніться до служби підтримки QuickXchange, вказавши деталі замовлення та TXID, щоб переказ можна було перевірити, проте можливість відновлення не гарантується.` |
| 2309 | `Ознайомтеся з курсом та деталями замовлення, щоб дізнатися про комісії для обраного напрямку. QuickXchange не бере на себе комісії, які не вказані в цих деталях.` |
| 2316 | `Як зв'язатися зі службою підтримки QuickXchange?` |
| 2317 | `Як працює QuickXchange &#124; QuickXchange` |
| 2319 | `Підтвердження замовлення · QuickXchange` |
| 2323 | `Що робить QuickXchange особливим?` |
| 2439 | `Цей обліковий запис Telegram вже прив'язаний до іншого акаунта QuickXchange. Якщо ви вважаєте, що це помилка, зверніться до служби підтримки QuickXchange.` |
| 2444 | `Посібник користувача &#124; QuickXchange` |
| 2445 | `Дотримуйтесь посібника користувача QuickXchange для покрокового навчання щодо обміну криптовалют, конвертації, фінансування ордерів, відстеження, інструментів акаунта та безпеки обміну.` |
| 2447 | `Посібник користувача QuickXchange` |
| 2518 | `Підготовка рахунку QuickXchange` |
| 2636 | `customer.quickxchangeUpdates` |
| 2636 | `Оновлення QuickXchange` |

**`lib/i18n/src/customer.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `Enter your QuickXchange Order ID to see the latest status and transaction details.` |
| 2 | `QuickXchange Order ID` |
| 2 | `You can find it in your QuickXchange order confirmation or inside My Orders when signed in.` |
| 2 | `Follow QuickXChange` |
| 2 | `QuickXChange official community channels` |
| 2 | `Follow QuickXChange on {{v0}}` |
| 2 | `Share your experience with QuickXchange` |
| 2 | `Choose a popular active route and continue directly in the QuickXchange widget.` |
| 2 | `QuickXchange &mdash; All rights reserved.` |
| 2 | `Exchange crypto, create and track orders, and get support directly from Telegram — fast, simple and always connected to QuickXchange.` |
| 2 | `QuickXchangeBot` |
| 2 | `👋 Welcome to QuickXchange!` |
| 2 | `Crypto Pairs &#124; QuickXchange` |
| 2 | `Browse available QuickXchange Convert routes, filter crypto pairs, and continue with the selected pair in the Convert widget.` |
| 2 | `Browse enabled crypto conversion routes and continue with your selected pair in the QuickXchange Convert flow.` |
| 2 | `Filter the enabled Convert routes published by QuickXchange.` |
| 2 | `Welcome to QuickXchange. Press Start to open the bot menu.` |
| 2 | `How QuickXchange Works` |
| 2 | `Exchange with QuickXchange on Telegram` |
| 2 | `Open QuickXchange Bot` |
| 2 | `Open the official QuickXchange Telegram Bot and press Start.` |
| 2 | `Promote QuickXchange among your affiliates and teach them how to exchange between payment methods. Earn 30% of fees from their orders.` |
| 2 | `Thanks — you’re subscribed to QuickXchange updates.` |
| 2 | `Contact QuickXchange support on Telegram` |
| 2 | `Email QuickXchange support` |
| 2 | `QuickXchange takes measures intended to reduce the risk that its services are used for money laundering, terrorist financing, fraud, sanctions evasion, or other prohibited activity.` |
| 2 | `Your QuickXchange account is now connected to Telegram. You may return to Telegram to continue.` |
| 2 | `Welcome to the QuickXchange User Manual. This guide provides step-by-step instructions for navigating the exchange platform. Whether you are using a supported manual Swap route or an automated crypto-to-crypto Convert route, use this document to understand each stage before submitting funds.` |
| 2 | `QuickXchange offers two distinct exchange journeys tailored to your needs. Selecting the right one ensures a smooth transaction.` |
| 2 | `QuickXchange Swap screen showing the You Send and You Receive selectors` |
| 2 | `QuickXchange Convert screen showing crypto selectors and floating-rate choice` |
| 2 | `Take an extra moment to double-check the destination and refund addresses. Blockchain transactions are irreversible. QuickXchange cannot recover funds sent to incorrect addresses.` |
| 2 | `QuickXchange Track your order page with an Order ID field and Track Order button` |
| 2 | `QuickXchange provides an affiliate program for users who wish to invite others to the platform.` |
| 2 | `QuickXchange is designed to be used securely inside Telegram. Please open the bot to access your account.` |
| 2 | `QuickXchange Account` |
| 2 | `Link QuickXchange Account` |
| 2 | `Link your QuickXchange account to manage your orders securely across platforms.` |
| 2 | `Welcome to QuickXchange` |
| 2 | `Need help with an order or have questions about QuickXchange? Our team is here to help.` |
| 2 | `Identity Verification and AML Policy &#124; QuickXchange` |
| 2 | `Read the QuickXchange identity verification, source-of-funds, transaction review, and anti-money-laundering policy.` |
| 2 | `The AML Policy establishes the principles QuickXchange applies to identity verification, source-of-funds checks, suspicious-transaction review, user cooperation, and lawful information requests. It applies to users and transactions where verification or enhanced review is required.` |
| 2 | `This notice for QuickXchange ("Company," "we," "us," or "our") describes how and why we might collect, store, use, and/or share ("process") your information when you use our Services, such as when you visit the QuickXchange platform or another platform of ours that links to this notice, or engage with us in other related ways, including sales, marketing, or events. Questions or concerns? Reading this notice will help you understand your rights and choices.` |
| 2 | `When you visit, use, or navigate our Services, we may process personal information depending on how you interact with QuickXchange and the Services, the choices you make, and the products and features you use.` |
| 2 | `We collect personal information that you voluntarily provide when you register for the Services, request information about our products or services, participate in activities on the Services, complete a transaction, or contact us. The information we collect depends on your interactions with QuickXchange, the choices you make, and the products and features you use. It may include your name, phone number, email address, username, billing details, and payment or wallet information needed for a selected transaction route. All personal information you provide must be true, complete, and accurate, and you must notify us of relevant changes.` |
| 2 | `QuickXchange Editorial` |
| 2 | `Market Intelligence &#124; QuickXchange` |
| 2 | `What is QuickXchange?` |
| 2 | `QuickXchange is a guided crypto exchange designed to provide clear route, payment, transfer, and order information before you act.` |
| 2 | `Swap uses configured QuickXchange routes and guided settlement/payment details. Convert uses supported provider conversion routes when available.` |
| 2 | `Wrong-network transfers may not be recoverable. Contact QuickXchange support with your order details and TXID so the transfer can be reviewed, without assuming recovery is possible.` |
| 2 | `Review the quote and order details for the fees applied to your selected route. QuickXchange does not assume fees that are not shown in those details.` |
| 2 | `How do I contact QuickXchange support?` |
| 2 | `How QuickXchange Works &#124; QuickXchange` |
| 2 | `Order Confirmation · QuickXchange` |
| 2 | `What makes QuickXchange different?` |
| 2 | `This Telegram account is already connected to another QuickXchange account. If you believe this is a mistake, contact QuickXchange support.` |
| 2 | `User Manual &#124; QuickXchange` |
| 2 | `Follow the QuickXchange user manual for step-by-step guidance on crypto swaps, conversions, order funding, tracking, account tools, and exchange safety.` |
| 2 | `QuickXchange User Manual` |
| 2 | `Preparing QuickXchange invoice` |
| 2 | `quickxchangeUpdates` |
| 2 | `QuickXchange Updates` |

**`lib/i18n/src/locales/de.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `QuickXchange` |
| 15 | `Wählen Sie die Sprache für QuickXchange.` |
| 25 | `Wachsen Sie mit uns — verdienen Sie Provisionen durch neue QuickXchange-Nutzer.` |
| 27 | `Prüfen Sie die vollständige QuickXchange-Auftrags-ID und versuchen Sie es erneut.` |
| 29 | `© {{year}} QuickXchange. Alle Rechte vorbehalten.` |
| 29 | `So funktioniert QuickXchange` |
| 30 | `Fügen Sie Ihre QuickXchange-Auftrags-ID ein, um die neueste Aktualisierung des Desks zu sehen. Kein Konto erforderlich.` |
| 30 | `Verwenden Sie die QuickXchange-Auftrags-ID, die nach Erstellung Ihres Auftrags angezeigt wurde.` |
| 31 | `Die Anmeldung bestätigt Ihre Identität, doch QuickXchange gewährt Desk-Zugriff nur aktiven Konten im serverseitigen Operator-Register.` |
| 1158 | `Ihr Konto wurde nicht abgelehnt. Die serverseitige Operator-Registrierung war nicht erreichbar, daher hat QuickXchange den Zugriff sicher verweigert.` |

**`lib/i18n/src/locales/en.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 13 | `QuickXchange` |
| 46 | `Select the language used throughout QuickXchange.` |
| 119 | `Grow with us — earn commissions by bringing new users to QuickXchange.` |
| 128 | `Check the complete QuickXchange order ID and try again.` |
| 130 | `© {{year}} QuickXchange. All rights reserved.` |
| 130 | `How QuickXchange works` |
| 131 | `Paste your QuickXchange order ID to see the latest desk update. No account required.` |
| 131 | `Use the QuickXchange order ID shown after your order was created.` |
| 132 | `Signing in proves your identity, but QuickXchange grants desk access only to active accounts in the server-side operator registry.` |
| 1312 | `Your account has not been denied. The server-side operator registry could not be reached, so QuickXchange failed closed.` |
| 1331 | `Already in QuickXchange` |

**`lib/i18n/src/locales/es.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `QuickXchange` |
| 15 | `Selecciona el idioma que se utilizará en QuickXchange.` |
| 24 | `Crece con nosotros: gana comisiones al traer nuevos usuarios a QuickXchange.` |
| 26 | `Comprueba el ID completo del pedido de QuickXchange e inténtalo de nuevo.` |
| 28 | `© {{year}} QuickXchange. Todos los derechos reservados.` |
| 28 | `Cómo funciona QuickXchange` |
| 29 | `Pega tu ID de pedido de QuickXchange para consultar la actualización más reciente de la mesa. No necesitas una cuenta.` |
| 29 | `Usa el ID de pedido de QuickXchange que se muestra después de crear el pedido.` |
| 30 | `Iniciar sesión demuestra tu identidad, pero QuickXchange concede acceso a la mesa solo a las cuentas activas del registro de operadores del servidor.` |
| 1813 | `Tu cuenta no ha sido rechazada. No se pudo acceder al registro de operadores del servidor, por lo que QuickXchange denegó el acceso de forma segura.` |

**`lib/i18n/src/locales/fr.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `QuickXchange` |
| 15 | `Sélectionnez la langue utilisée dans QuickXchange.` |
| 24 | `Grandissez avec nous — gagnez des commissions en apportant de nouveaux utilisateurs à QuickXchange.` |
| 26 | `Vérifiez l’identifiant complet de commande QuickXchange et réessayez.` |
| 28 | `© {{year}} QuickXchange. Tous droits réservés.` |
| 28 | `Comment fonctionne QuickXchange` |
| 29 | `Collez votre identifiant de commande QuickXchange pour consulter la dernière mise à jour du desk. Aucun compte n’est requis.` |
| 29 | `Utilisez l’identifiant de commande QuickXchange affiché après la création de votre commande.` |
| 30 | `La connexion confirme votre identité, mais QuickXchange n’accorde l’accès au desk qu’aux comptes actifs présents dans le registre des opérateurs côté serveur.` |
| 1159 | `Votre compte n’a pas été refusé. Le registre des opérateurs côté serveur était inaccessible, QuickXchange a donc refusé l’accès de manière sécurisée.` |

**`lib/i18n/src/locales/ko.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `QuickXchange` |
| 15 | `QuickXchange에서 사용할 언어를 선택하세요.` |
| 24 | `QuickXchange에 새 사용자를 소개하여 커미션을 받으세요.` |
| 26 | `QuickXchange 주문 ID 전체를 확인한 후 다시 시도하세요.` |
| 28 | `© {{year}} QuickXchange. 모든 권리 보유.` |
| 28 | `QuickXchange 이용 방법` |
| 29 | `QuickXchange 주문 ID를 붙여 넣어 최신 데스크 업데이트를 확인하세요. 계정이 필요하지 않습니다.` |
| 29 | `주문 생성 후 표시된 QuickXchange 주문 ID를 사용하세요.` |
| 30 | `로그인은 신원을 증명하지만, QuickXchange는 서버 측 운영자 등록부에서 활성 상태인 계정에만 데스크 접근 권한을 부여합니다.` |
| 512 | `계정이 거부된 것은 아닙니다. 서버의 운영자 등록부에 연결할 수 없어 QuickXchange가 안전하게 접근을 차단했습니다.` |

**`lib/i18n/src/locales/ru.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `QuickXchange` |
| 15 | `Выберите язык интерфейса QuickXchange.` |
| 24 | `Растите с нами — получайте комиссии, привлекая новых пользователей в QuickXchange.` |
| 26 | `Проверьте полный идентификатор заказа QuickXchange и повторите попытку.` |
| 28 | `© {{year}} QuickXchange. Все права защищены.` |
| 28 | `Как работает QuickXchange` |
| 29 | `Вставьте ID заявки QuickXchange, чтобы увидеть последнее обновление оператора. Аккаунт не требуется.` |
| 29 | `Используйте ID заявки QuickXchange, показанный после её создания.` |
| 30 | `Вход подтверждает вашу личность, но QuickXchange предоставляет доступ к операционному столу только активным аккаунтам из реестра операторов на стороне сервера.` |
| 1159 | `Ваш аккаунт не был отклонён. Серверный реестр операторов недоступен, поэтому QuickXchange безопасно закрыл доступ.` |

**`lib/i18n/src/locales/uk.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 19 | `QuickXchange` |
| 23 | `Виберіть мову інтерфейсу QuickXchange.` |
| 32 | `Зростайте з нами — отримуйте комісії, залучаючи нових користувачів до QuickXchange.` |
| 34 | `Перевірте повний ID заявки QuickXchange і повторіть спробу.` |
| 36 | `© {{year}} QuickXchange. Усі права захищено.` |
| 36 | `Як працює QuickXchange` |
| 37 | `Вставте ID заявки QuickXchange, щоб переглянути останнє оновлення від оператора. Акаунт не потрібен.` |
| 37 | `Скористайтеся ID заявки QuickXchange, показаним після її створення.` |
| 38 | `Вхід підтверджує вашу особу, але QuickXchange надає доступ до операційної панелі лише активним акаунтам у серверному реєстрі операторів.` |
| 1190 | `Ваш акаунт не було відхилено. Серверний реєстр операторів недоступний, тому QuickXchange безпечно закрив доступ.` |

**`scripts/production-build.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 35 | `artifacts/quickxchange-telegram-mini-app/dist` |
| 64 | `@workspace/quickxchange-telegram-mini-app` |
| 73 | `artifacts/quickxchange-telegram-mini-app/dist/public/index.html` |
| 74 | `artifacts/quickxchange-telegram-mini-app/dist/public/build-manifest.json` |

**`scripts/src/audit-customer-localization.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 9 | `artifacts/quickxchange-telegram-mini-app/src` |

**`scripts/src/collect-localization-gaps.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 43 | `/artifacts/quickxchange-telegram-mini-app/src` |
| 44 | `What is QuickXchange?` |

**`scripts/src/wrap-dynamic-customer-text.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 10 | `artifacts/quickxchange-telegram-mini-app/src/pages/exchange.tsx` |
| 11 | `artifacts/quickxchange-telegram-mini-app/src/pages/order-detail.tsx` |

### Bundled logo / favicon


**`artifacts/crypto-exchange-widget/public/favicon.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `artifacts/crypto-exchange-widget/public/favicon.svg (original artwork; replace binary/SVG, not a text substitution)` |

**`artifacts/crypto-exchange-widget/public/logo-dark.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `artifacts/crypto-exchange-widget/public/logo-dark.svg (original artwork; replace binary/SVG, not a text substitution)` |

**`artifacts/crypto-exchange-widget/public/logo-light.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `artifacts/crypto-exchange-widget/public/logo-light.svg (original artwork; replace binary/SVG, not a text substitution)` |

**`artifacts/crypto-exchange-widget/public/logo.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `artifacts/crypto-exchange-widget/public/logo.svg (original artwork; replace binary/SVG, not a text substitution)` |

**`artifacts/quickxchange-telegram-mini-app/public/favicon.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `artifacts/quickxchange-telegram-mini-app/public/favicon.svg (original artwork; replace binary/SVG, not a text substitution)` |

### Business/config numeric default


**`artifacts/api-server/src/lib/quickex.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1025, 1129 | `markup: "0"` |

**`artifacts/api-server/src/routes/exchange.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2295 | `exactRate: "1"` |

### Configuration/document identity


**`DEPLOYMENT.md`**

| Exact line(s) | Value / excerpt |
|---|---|
| 111 | `### Separate QuickXchange Support Bot` |

**`artifacts/crypto-exchange-widget/public/favicon.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="QuickXchange">` |

**`artifacts/crypto-exchange-widget/public/logo.svg`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `<title id="title">Rook</title>` |
| 3 | `<desc id="desc">Rook exchange desk logo</desc>` |
| 8 | `<text x="76" y="49" fill="#211137" font-family="Space Grotesk, DM Sans, sans-serif" font-size="44" font-weight="700" letter-spacing="-3">Rook<tspan fill="#6d28d9">.</tspan></text>` |

**`artifacts/crypto-exchange-widget/public/robots.txt`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5 | `Sitemap: https://quickchange.exchange/sitemap.xml` |

**`artifacts/crypto-exchange-widget/public/sitemap.xml`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `<url><loc>https://quickchange.exchange/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>` |
| 4 | `<url><loc>https://quickchange.exchange/swap</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>` |
| 5 | `<url><loc>https://quickchange.exchange/convert</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>` |
| 6 | `<url><loc>https://quickchange.exchange/user-manual</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>` |
| 7 | `<url><loc>https://quickchange.exchange/market-rates</loc><changefreq>daily</changefreq><priority>0.8</priority></url>` |
| 8 | `<url><loc>https://quickchange.exchange/crypto-pairs</loc><changefreq>daily</changefreq><priority>0.8</priority></url>` |
| 9 | `<url><loc>https://quickchange.exchange/status</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>` |
| 10 | `<url><loc>https://quickchange.exchange/how-it-works</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>` |
| 11 | `<url><loc>https://quickchange.exchange/faq</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>` |
| 12 | `<url><loc>https://quickchange.exchange/blog</loc><changefreq>daily</changefreq><priority>0.8</priority></url>` |
| 13 | `<url><loc>https://quickchange.exchange/about</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>` |
| 14 | `<url><loc>https://quickchange.exchange/affiliates</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>` |
| 15 | `<url><loc>https://quickchange.exchange/contact</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>` |
| 16 | `<url><loc>https://quickchange.exchange/operations</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>` |
| 17 | `<url><loc>https://quickchange.exchange/aml-kyc</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>` |
| 18 | `<url><loc>https://quickchange.exchange/privacy</loc><changefreq>yearly</changefreq><priority>0.4</priority></url>` |
| 19 | `<url><loc>https://quickchange.exchange/terms</loc><changefreq>yearly</changefreq><priority>0.4</priority></url>` |

**`artifacts/quickxchange-telegram-mini-app/.replit-artifact/artifact.toml`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `title = "QuickXchange Telegram Mini App"` |
| 4 | `description = "A dedicated mobile-first Telegram Mini App frontend that securely reuses the existing QuickXchange backend, exchange catalog, pricing, orders, customer data, and Telegram Bot integration."` |

**`lib/api-spec/openapi.yaml`**

| Exact line(s) | Value / excerpt |
|---|---|
| 689 | `description: Exact Rook status, or active for every non-terminal status.` |

### Email


**`artifacts/api-server/src/lib/contact-support-email.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 64 | `QuickXchange Website <support@quickchange.exchange>` |
| 73 | `support@quickchange.exchange` |

**`artifacts/api-server/src/lib/convert-admin-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 284 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/api-server/src/lib/customer-status-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 782 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/api-server/src/lib/newsletter.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 176 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/api-server/src/routes/exchange.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 389, 398 | `sarah.chen@example.com` |
| 390, 406 | `marco.rossi@example.com` |
| 391, 414 | `alex.johnson@example.com` |

**`artifacts/api-server/src/routes/notification-settings.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 64 | `QuickXchange <support@quickchange.exchange>` |

**`artifacts/crypto-exchange-widget/src/components/shared-app-ui.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `support@quickchange.exchange` |

**`artifacts/crypto-exchange-widget/src/pages/admin-team-members.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 294 | `alice@example.com` |

**`artifacts/crypto-exchange-widget/src/pages/admin.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2161 | `[redacted contact/address literal; review source locally]` |
| 2365 | `user@example.com` |

**`artifacts/crypto-exchange-widget/vite.config.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 61 | `[redacted contact/address literal; review source locally]` |

**`lib/db/benchmark-reconciliation-history.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 56 | `[redacted contact/address literal; review source locally]` |

**`lib/i18n/src/clerk-source.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 58 | `[redacted contact/address literal; review source locally]` |
| 62 | `you@example.com` |
| 69 | `Example format: name@example.com` |

**`lib/i18n/src/completed/de.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 296, 1593 | `[redacted contact/address literal; review source locally]` |
| 482 | `jane@example.com` |
| 1604 | `Beispielformat: name@example.com` |

**`lib/i18n/src/completed/es.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 289 | `[redacted contact/address literal; review source locally]` |
| 475 | `jane@example.com` |
| 1597 | `Formato de ejemplo: name@example.com` |

**`lib/i18n/src/completed/fr.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 302, 1599 | `[redacted contact/address literal; review source locally]` |
| 488 | `jane@example.com` |
| 1610 | `Format d'exemple : name@example.com` |

**`lib/i18n/src/completed/ko.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5, 282, 1583 | `you@example.com` |
| 468 | `jane@example.com` |
| 1590 | `예시: name@example.com` |

**`lib/i18n/src/completed/ru.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 6, 283, 1584 | `you@example.com` |
| 469 | `jane@example.com` |
| 1591 | `Пример формата: name@example.com` |

**`lib/i18n/src/completed/uk.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 6, 283, 1584 | `you@example.com` |
| 469 | `jane@example.com` |
| 1591 | `Приклад формату: name@example.com` |

**`lib/i18n/src/customer.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `jane@example.com` |
| 2 | `you@example.com` |

**`lib/i18n/src/locales/de.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21 | `[redacted contact/address literal; review source locally]` |
| 349 | `operator@example.com` |
| 627 | `user@example.com` |

**`lib/i18n/src/locales/en.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 107 | `you@example.com` |
| 460 | `operator@example.com` |
| 757 | `user@example.com` |

**`lib/i18n/src/locales/es.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21 | `[redacted contact/address literal; review source locally]` |
| 1070 | `user@example.com` |
| 1710 | `operator@example.com` |

**`lib/i18n/src/locales/fr.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21, 349, 627 | `[redacted contact/address literal; review source locally]` |

**`lib/i18n/src/locales/ko.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21 | `you@example.com` |
| 245 | `operator@example.com` |
| 317 | `user@example.com` |

**`lib/i18n/src/locales/ru.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21 | `you@example.com` |
| 349 | `operator@example.com` |

**`lib/i18n/src/locales/uk-admin/adminOrders.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 92 | `user@example.com` |

**`lib/i18n/src/locales/uk-admin/adminStaff.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 57 | `operator@example.com` |

**`lib/i18n/src/locales/uk.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 29 | `you@example.com` |

### Font


**`artifacts/crypto-exchange-widget/src/App.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 246 | `var(--font-sans)` |

**`artifacts/crypto-exchange-widget/src/admin-notifications-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 13, 329 | `font-family: var(--font-sans);` |
| 303 | `font-family: monospace;` |

**`artifacts/crypto-exchange-widget/src/admin-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 169, 11153, 12514 | `font-family: var(--font-sans);` |
| 943, 2385, 2864, 2895, 3110, 3255, 3270, 4783, 5071, 7362, 7376, 7569, 7585, 7591, 9130, 9421, 9927, 11143, 11223, 13335, 13968, 14415, 16452, 17385 | `font-family: var(--font-mono);` |
| 6640, 6836 | `font-family: ui-monospace, SFMono-Regular, Menlo, monospace;` |
| 12521, 12541, 12555, 12794 | `font-family: inherit;` |

**`artifacts/crypto-exchange-widget/src/components/community-section.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 41 | `font-family: var(--font-mono, monospace);` |
| 59 | `font-family: var(--font-marketing, 'Outfit', sans-serif);` |

**`artifacts/crypto-exchange-widget/src/components/deposit-details-modal.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 28 | `font-family: var(--font-sans, inherit);` |
| 246 | `.deposit-details-modal-amount { max-width: 100%; margin-top: 3px; font-family: var(--font-mono, monospace); font-weight: 800; font-size: clamp(22px, 6vw, 31px); line-height: 1.2; overflow-wrap: anywhere; }` |
| 247 | `.deposit-details-modal-amount-unit { color: #087baf; font-size: .57em; font-family: var(--font-sans, inherit); }` |
| 263 | `.deposit-details-modal-value { flex: 1; min-width: 0; color: inherit; font-family: var(--font-mono, monospace); font-size: 12px; font-weight: 650; line-height: 1.55; overflow-wrap: anywhere; word-break: break-all; user-select: all; }` |
| 304 | `.deposit-details-modal-order-id { font-family: var(--font-mono, monospace); text-align: right; overflow-wrap: anywhere; }` |

**`artifacts/crypto-exchange-widget/src/components/manual/manual-guides.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 8 | `.mg-brand{display:flex;align-items:center;gap:.5em;font-family:var(--font-marketing);font-weight:800;font-size:1em}` |
| 39 | `.mg-funding-head strong{font-family:var(--font-marketing);font-size:1.15rem;color:hsl(var(--foreground))}` |
| 58 | `.user-manual-toc-num{font-family:var(--font-marketing);font-size:.72rem;font-weight:900;opacity:.7}` |

**`artifacts/crypto-exchange-widget/src/flag-icon.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 115 | `font-family: var(--font-sans);` |
| 125 | `font-family: var(--font-mono);` |

**`artifacts/crypto-exchange-widget/src/i18n/language-selector.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 12 | `font-family: inherit;` |

**`artifacts/crypto-exchange-widget/src/index.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 228 | `.order-invoice-title span { margin-left: auto; color: hsl(var(--muted-foreground)); font-family: var(--font-mono); font-size: .75rem; word-break: break-all; }` |
| 242 | `.order-invoice-meta code { display: block; overflow-wrap: anywhere; color: hsl(var(--foreground)); font-family: var(--font-mono); font-size: .72rem; word-break: break-all; }` |
| 303, 12267, 16398, 16474 | `font-family: var(--font-marketing);` |
| 400, 2660, 4421, 4457, 10259, 10350, 15044, 15752, 16524, 16797, 20919, 21771, 22027, 22110, 22151, 24879 | `font-family: var(--font-mono);` |
| 483 | `--font-sans: 'Outfit', sans-serif;` |
| 484 | `--font-mono: 'Spline Sans Mono', monospace;` |
| 2899, 9956, 15497, 15515, 15568, 15583, 21560, 22037, 22120 | `font-family: var(--font-sans);` |
| 3590 | `.order-drawer-head h2 { margin: 0; font-family: var(--font-mono); font-weight: 600; font-size: 24px; letter-spacing: -.055em; }` |
| 4224 | `.quote-breakdown strong { color: hsl(var(--foreground)); font-family: var(--font-mono); text-align: right; }` |
| 4254, 4586 | `.pricing-totals strong { color: hsl(var(--foreground)); font-family: var(--font-mono); text-align: right; }` |
| 4489, 4539 | `font-family: var(--font-mono); }` |
| 4491 | `.avatar { width: 36px; height: 36px; font-size: 13px; border-radius: 50%; display: grid; place-items: center; background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); font-weight: 700; font-family: var(--font-mono); }` |
| 7212 | `font-family: serif;` |
| 10844, 11755, 12054, 12098, 12140 | `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;` |

**`artifacts/crypto-exchange-widget/src/network-drawer-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 68 | `font-family: var(--font-mono);` |
| 140 | `.qx-network-editor .qx-network-section > .panel-heading .section-kicker { font-family: var(--font-mono); letter-spacing: .12em; }` |

**`artifacts/crypto-exchange-widget/src/order-confirmation.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 186, 415, 500, 541 | `font-family: var(--font-mono);` |
| 425, 510 | `font-family: var(--font-sans);` |

**`artifacts/crypto-exchange-widget/src/pages/how-it-works.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 124 | `font-family: var(--font-mono);` |

**`artifacts/crypto-exchange-widget/src/pages/site-content-admin.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 24 | `margin: 0; font-family: var(--font-marketing), var(--font-sans); font-size: clamp(23px, 2.4vw, 32px);` |
| 101 | `margin: 0; font-family: var(--font-marketing), var(--font-sans);` |

**`artifacts/crypto-exchange-widget/src/pages/user-manual.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 39, 103, 147, 282, 288, 554, 610 | `font-family: var(--font-marketing);` |

**`artifacts/quickxchange-telegram-mini-app/src/index.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap');` |
| 38 | `--font-sans: var(--font-sans);` |
| 39 | `--font-mono: var(--font-mono);` |
| 77 | `--font-sans: 'Plus Jakarta Sans', sans-serif;` |
| 78 | `--font-mono: 'Spline Sans Mono', monospace;` |

### Historical migration / legacy brand


**`lib/db/migrations/0055_blog_author_settings_categories.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 44 | `('QuickXchange Updates', 'quickxchange-updates', 'quickxchange-updates', '', 90, true, 'system', 'system')` |

**`lib/db/migrations/0133_seed_quickxchange_social_links.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 34 | `('Medium', 'https://medium.com/@quickchange1001', 2),` |
| 91 | `'https://medium.com/@quickchange1001',` |
| 133, 149 | `'source', 'quickxchange-official-social-links',` |

### Inline visual palette


**`artifacts/api-server/src/lib/blog-cover-system.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 146, 168 | `#13ddf4` |
| 146, 168 | `#258cff` |
| 146, 168 | `#7a2cff` |

**`artifacts/api-server/src/lib/customer-status-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 489 | `#06b6d4` |
| 494, 506, 509 | `#4ade80` |
| 506, 522, 532, 537 | `#ffffff` |

**`artifacts/api-server/src/routes/site-content.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 217 | `#111827` |
| 218 | `#374151` |
| 219 | `#6366f1` |

**`artifacts/crypto-exchange-widget/src/App.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 238 | `hsl(var(--primary))` |
| 239, 244 | `hsl(var(--foreground))` |
| 240 | `hsl(var(--muted-foreground))` |
| 241 | `hsl(var(--destructive))` |
| 242 | `hsl(var(--card))` |
| 243 | `hsl(var(--input))` |
| 245 | `hsl(var(--border))` |

**`artifacts/crypto-exchange-widget/src/components/AffiliateGrowthChart.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 22, 34, 38 | `#8b5cf6` |
| 23 | `#2563eb` |
| 26 | `#4f8cff` |
| 27, 38 | `#a855f7` |
| 30 | `hsl(var(--border))` |
| 31, 32, 36 | `hsl(var(--muted-foreground))` |
| 35 | `hsl(var(--popover))` |
| 38 | `hsl(var(--background))` |

**`artifacts/crypto-exchange-widget/src/components/payment-method-logo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 84 | `#9FE870` |
| 86 | `#36A18B` |
| 87 | `#00457C` |
| 88 | `#741AFC` |
| 89 | `#00D632` |
| 90 | `#008CFF` |
| 91 | `#FFFFFF` |
| 91 | `#1434CB` |
| 95 | `#EB001B` |
| 96 | `#F79E1B` |
| 97 | `#FF5F00` |
| 102 | `#00A1E9` |
| 103 | `#32BCAD` |

**`artifacts/crypto-exchange-widget/src/components/public-shell.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 147, 234, 279 | `#38bdf8` |
| 231, 279 | `#dce3ed` |
| 233, 279 | `#ffffff` |

**`artifacts/crypto-exchange-widget/src/components/social-brand-mark.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 32 | `#fff` |
| 33 | `#1877f2` |
| 34 | `#3861d0` |
| 35, 36 | `#141414` |
| 37 | `#0a66c2` |
| 38 | `#ff0033` |
| 39 | `#111827` |
| 40 | `#26a5e4` |
| 41 | `#25d366` |
| 42 | `#5865f2` |
| 43 | `#ff4500` |
| 44 | `#24292f` |
| 45 | `#00b67a` |
| 46 | `#5076ba` |

**`artifacts/crypto-exchange-widget/src/components/social-trust-editor.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 29 | `#ffffff` |
| 29 | `#dce3ed` |
| 29 | `#38bdf8` |

**`artifacts/crypto-exchange-widget/src/components/telegram-bot-promo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 101, 109 | `radial-gradient(circle at center, currentColor 1px, transparent 1px)` |

**`artifacts/crypto-exchange-widget/src/pages/admin-overview-charts.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 40, 62, 66, 88 | `#13DDF4` |
| 41 | `#2448FF` |
| 44, 47, 71, 74, 117 | `hsl(var(--border))` |
| 45, 46, 72, 73, 74 | `hsl(var(--muted-foreground))` |
| 47 | `hsl(var(--muted))` |
| 47, 74, 117 | `hsl(var(--card))` |
| 47, 117 | `hsl(var(--foreground))` |
| 63, 68 | `#7A2CFF` |
| 67 | `#087BFF` |
| 74 | `hsl(var(--primary))` |
| 87 | `#10B981` |
| 89 | `#EF4444` |

**`artifacts/crypto-exchange-widget/src/pages/how-it-works.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 49, 78 | `#F7931A` |
| 205, 234, 284 | `#26A17B` |
| 218, 249, 286 | `#627EEA` |
| 362, 370 | `radial-gradient(circle at center, currentColor 1px, transparent 1px)` |

**`artifacts/crypto-exchange-widget/src/pages/site-content.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1410 | `#111827` |
| 1410 | `#374151` |
| 1410 | `#6366f1` |

**`lib/db/src/schema/site-content.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 145, 224 | `#111827` |
| 145, 224 | `#374151` |
| 145, 224 | `#6366f1` |

### Legal / company policy copy


**`artifacts/crypto-exchange-widget/src/lib/legal-page-content.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 9 | `This notice for QuickXchange ("Company," "we," "us," or "our") describes how and why we might collect, store, use, and/or share ("process") your information when you use our Services, such as when you visit the QuickXchange platform or another platform of ours that links to this notice, or engage with us in other related ways, including sales, marketing, or events.<br><br>Questions or concerns? Reading this notice will help you understand your rights and choices.` |
| 13 | `This summary provides key points from our notice. More details about these topics are provided in the Privacy Policy.` |
| 16 | `What personal information do we process?` |
| 17 | `When you visit, use, or navigate our Services, we may process personal information depending on how you interact with QuickXchange and the Services, the choices you make, and the products and features you use.` |
| 20 | `Do we process sensitive personal information?` |
| 21 | `We do not process sensitive personal information.` |
| 24 | `Do we receive information from third parties?` |
| 25 | `We do not receive personal information directly from third parties, except when necessary to provide or secure the Services, process a requested transaction, or comply with applicable law.` |
| 28 | `How do we process your information?` |
| 29 | `We process information to provide, improve, and administer our Services, communicate with you, support security and fraud prevention, and comply with the law. We may also process information for other purposes with your consent. We process information only when we have a valid legal reason to do so.` |
| 32 | `When do we share personal information?` |
| 33 | `We may share information in specific situations and with service providers or other parties when needed to operate the Services, process a requested transaction, maintain security, or comply with applicable law.` |
| 36 | `How do we keep your information safe?` |
| 37 | `We use organizational and technical processes intended to protect personal information. However, no electronic transmission over the internet or information-storage technology can be guaranteed to be 100% secure.` |
| 41 | `Depending on where you are located, applicable privacy law may provide certain rights regarding your personal information. The Privacy Policy explains these rights and how to exercise them.` |
| 47 | `What Information Do We Collect?` |
| 48 | `We collect personal information that you voluntarily provide when you register for the Services, request information about our products or services, participate in activities on the Services, complete a transaction, or contact us.<br><br>The information we collect depends on your interactions with QuickXchange, the choices you make, and the products and features you use. It may include your name, phone number, email address, username, billing details, and payment or wallet information needed for a selected transaction route.<br><br>All personal information you provide must be true, complete, and accurate, and you must notify us of relevant changes.` |
| 51 | `How Do We Process Your Information?` |
| 52 | `We process personal information to provide, improve, and administer our Services, communicate with you, support security and fraud prevention, process requested transactions, and comply with applicable law. We may also process information for other purposes with your consent and only when we have a valid legal basis.` |
| 55 | `How Do We Keep Your Information Safe?` |
| 56 | `We use organizational and technical processes and procedures intended to protect personal information. However, no electronic transmission over the internet or information-storage technology can be guaranteed to be 100% secure, and unauthorized parties may attempt to defeat security controls.` |
| 60 | `You may review, change, or terminate your account at any time, subject to applicable law. If you are located in the EEA or UK and believe your information is being processed unlawfully, you may have the right to complain to your local data-protection supervisory authority. Residents of Switzerland may also contact the applicable data-protection authority.` |
| 64 | `If we rely on your consent to process personal information, you may withdraw that consent at any time by contacting us. Withdrawal does not affect the lawfulness of processing completed before consent was withdrawn, and it does not affect processing that relies on another lawful basis.` |
| 67 | `Marketing and Promotional Communications` |
| 68 | `You may unsubscribe from marketing and promotional communications at any time by using the unsubscribe link in an email or contacting us. We may still send service-related communications needed to administer your account, respond to requests, or provide the Services.` |
| 72 | `You may review or update available account information through your account settings. You may also request account termination, subject to applicable legal, security, fraud-prevention, and record-retention requirements.` |
| 75 | `Controls for Do-Not-Track Features` |
| 76 | `Some browsers, mobile operating systems, and applications include a Do-Not-Track ("DNT") setting. No uniform technology standard for recognizing and implementing DNT signals has been finalized, so we do not currently respond to DNT browser signals. If a standard we must follow is adopted, we will describe that practice in an updated notice.` |
| 80 | `California residents may have rights regarding access to personal information under applicable state law. California residents under 18 with a registered account may also have the right to request removal of certain information they publicly post. Requests are subject to verification and applicable legal limitations, including limitations involving backups and required records.` |
| 84 | `We may update this notice as necessary to remain current with applicable law and our practices. An updated version becomes effective when it is made accessible. For material changes, we may post a prominent notice or provide a direct notification.` |
| 87 | `Reviewing, Updating, or Deleting Your Data` |
| 88 | `Depending on the laws that apply where you live, you may have the right to request access to personal information we collect, ask us to correct it, or request deletion. We will consider and act on verified requests in accordance with applicable data-protection law.` |

**`artifacts/crypto-exchange-widget/src/pages/public-info-pages.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 12 | `../components/site-preview-context` |
| 30 | `meta[property="og:description"]` |
| 42 | `&#96;${basePath}/api/admin/site-page-media/${preview.pageKey}/${imagePath.split('/').pop()}/preview&#96;` |
| 43 | `&#96;${basePath}/api/storage/objects/site-page-media/${imagePath.split('/').pop()}&#96;` |
| 46 | `relative py-24 lg:py-32 overflow-hidden flex flex-col items-center justify-center text-center px-3 sm:px-6` |
| 46 | `lg:flex-row lg:text-left lg:justify-between max-w-6xl mx-auto gap-12` |
| 47 | `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[var(--qx-gradient)] opacity-[0.08] dark:opacity-[0.15] blur-[120px] rounded-full pointer-events-none` |
| 49 | `text-primary font-bold tracking-[0.2em] uppercase text-xs mb-6 inline-block` |
| 50 | `text-4xl md:text-6xl lg:text-7xl font-marketing font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.1] mb-6` |
| 53 | `text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed` |
| 59 | `relative aspect-square md:aspect-[4/3] w-full overflow-hidden rounded-3xl border border-border bg-card/50 shadow-sm` |
| 60 | `absolute inset-0 h-full w-full object-cover` |
| 72 | `bg-card/50 backdrop-blur-sm border border-border rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden` |
| 73 | `absolute top-0 left-0 w-full h-1 bg-[var(--qx-gradient)] opacity-70` |
| 74 | `text-2xl font-marketing font-bold text-foreground mb-6` |
| 75 | `space-y-6 text-muted-foreground leading-relaxed` |
| 86 | `max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 pb-32 space-y-12` |
| 150, 154 | `We are redefining the exchange experience with transparency, speed, and premium support.` |
| 155 | `What makes QuickXchange different?` |
| 190, 257 | `mb-8 text-center text-3xl font-marketing font-extrabold text-foreground md:text-4xl` |
| 193 | `about-value-card bg-card border border-border rounded-3xl p-8 shadow-sm` |
| 193 | `&#96;card-about-point-${index + 1}&#96;` |
| 194 | `about-heading-glow block text-4xl font-marketing font-extrabold text-primary mb-5` |
| 195 | `about-heading-glow text-xl font-bold text-foreground mb-3` |
| 196, 263 | `text-sm leading-relaxed text-muted-foreground` |
| 220, 224 | `Introduce customers to a clearer exchange experience and manage your referrals from one dedicated account area.` |
| 257 | `text-affiliate-how-it-works-title` |
| 260 | `affiliate-feature-card bg-card border border-border rounded-3xl p-8 shadow-sm` |
| 260 | `&#96;card-affiliate-step-${index + 1}&#96;` |
| 261 | `affiliate-feature-word block text-4xl font-marketing font-extrabold text-primary mb-5` |
| 262 | `affiliate-heading-glow text-lg font-bold text-foreground mb-3` |
| 288 | `For feedback, questions, or in case of issues, use the form or contact our support team.` |
| 332 | `max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-16 lg:py-24 space-y-24` |
| 333 | `grid lg:grid-cols-2 gap-16 lg:gap-24 items-start` |
| 337 | `text-4xl md:text-5xl font-marketing font-extrabold tracking-tight text-foreground mb-4` |
| 338 | `text-lg text-muted-foreground leading-relaxed` |
| 343, 354 | `contact-redesign-card contact-resource-link` |
| 348, 359, 370 | `text-base font-bold text-foreground mb-1` |
| 349, 360, 371 | `text-sm text-muted-foreground leading-relaxed` |
| 376 | `flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8` |
| 383, 395 | `group inline-flex min-h-11 items-center gap-3 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background` |
| 389 | `h-6 w-6 shrink-0 text-[#229ED9] transition duration-200 group-hover:drop-shadow-[0_0_8px_rgba(34,158,217,0.75)] group-active:drop-shadow-[0_0_10px_rgba(124,58,237,0.75)]` |
| 401 | `h-6 w-6 shrink-0 text-primary transition duration-200 group-hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.75)] group-active:drop-shadow-[0_0_10px_rgba(124,58,237,0.75)]` |
| 409 | `contact-redesign-panel p-8 md:p-10` |
| 410 | `text-2xl font-marketing font-bold text-foreground mb-8` |
| 414, 418, 423 | `text-xs font-bold text-muted-foreground uppercase tracking-wider` |
| 415, 419 | `w-full h-14 bg-input border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all` |
| 424 | `w-full min-h-[160px] bg-input border border-border rounded-xl p-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-y` |
| 427 | `contact-btn-gradient w-full h-14 font-bold rounded-xl flex items-center justify-center gap-2` |
| 434 | `contact-redesign-panel max-w-2xl mx-auto text-center p-8 md:p-10` |
| 435 | `text-3xl font-marketing font-bold text-foreground mb-4` |
| 437 | `flex flex-col sm:flex-row gap-3 max-w-md mx-auto` |
| 440 | `flex-1 h-12 bg-input border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all` |
| 446 | `h-12 px-8 bg-foreground text-background font-bold rounded-xl hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-60` |
| 451 | `mt-4 max-w-md mx-auto text-left` |
| 476, 480 | `Your privacy and data security are our highest priorities. Learn how we handle, protect, and process your information.` |
| 521, 525 | `Please read these terms carefully before using our platform. They outline your rights and responsibilities.` |
| 566, 570 | `We maintain strict compliance standards to prevent financial crime and ensure a secure trading environment.` |
| 588 | `aml-verification-card bg-muted/30 rounded-2xl p-6 mt-6 border border-border` |
| 590 | `list-disc pl-5 space-y-2 text-muted-foreground` |

### Logo / favicon / font asset


**`artifacts/api-server/src/lib/telegram-api.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 147 | `quickxchange-qr.png` |

**`artifacts/api-server/src/routes/site-content.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 134 | `/brand/quickxchange-header-light.png` |
| 135 | `/brand/quickxchange-header-dark.png` |

**`artifacts/crypto-exchange-widget/server.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 35 | `.woff` |
| 36 | `.woff2` |

**`artifacts/crypto-exchange-widget/src/App.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 223 | `/brand/quickxchange-header-light.png` |
| 224 | `/brand/quickxchange-header-dark.png` |

**`artifacts/crypto-exchange-widget/src/components/brand-logo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 32 | `/brand/quickxchange-header-light.png` |
| 33 | `/brand/quickxchange-header-dark.png` |

**`artifacts/crypto-exchange-widget/src/components/manual/manual-guides.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 16 | `&#96;${basePath}/payment-methods/sepa-logo.png&#96;` |
| 38 | `&#96;${basePath}/brand/quickxchange-mark.png&#96;` |

**`artifacts/crypto-exchange-widget/src/components/payment-method-logo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 52 | `https://cdn.icard.com/icard.com/img/common/logo.png?53` |
| 110 | `&#96;https://www.google.com/s2/favicons?domain=${encodeURIComponent(remoteDomain)}&sz=256&#96;` |
| 111 | `&#96;https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(&#96;https://${remoteDomain}&#96;)}&sz=256&#96;` |
| 114 | `&#96;${basePath}/payment-methods/sepa-logo.png&#96;` |

**`artifacts/crypto-exchange-widget/src/components/telegram-bot-promo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 80 | `&#96;${basePath}/brand/quickxchange-telegram-bot-logo.jpg&#96;` |

**`artifacts/crypto-exchange-widget/src/lib/invoice-pdf.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 19 | `&#96;${basePath}/brand/invoice&#96;` |
| 90 | `quickxchange-v1.png` |

**`artifacts/crypto-exchange-widget/src/pages/admin-appearance.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 193, 473, 477 | `faviconPath` |
| 212 | `/brand/quickxchange-header-dark.png` |
| 213 | `/brand/quickxchange-header-light.png` |
| 474 | `Favicon (Optional)` |

**`artifacts/quickxchange-telegram-mini-app/src/lib/logo-catalog.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 89 | `&#96;https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(&#96;https://${domain}&#96;)}&sz=256&#96;` |

**`lib/api-zod/src/generated/api.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 15626, 15685, 17514, 17578, 17632, 17694 | `faviconPath` |

**`lib/db/src/schema/website-branding.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 10 | `favicon_path` |

### SEO / identity


**`artifacts/crypto-exchange-widget/index.html`**

| Exact line(s) | Value / excerpt |
|---|---|
| 4 | `<meta charset="UTF-8" />` |
| 5 | `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />` |
| 6 | `<title>QuickXchange &#124; Crypto Swap and Conversion Platform</title>` |
| 7 | `<meta name="description" content="Use QuickXchange to swap supported crypto and fiat routes, convert digital assets, track exchange orders, and manage your exchange account." />` |
| 8 | `<meta name="keywords" content="crypto exchange, cryptocurrency exchange, crypto swap, convert cryptocurrency, swap crypto, digital asset exchange, exchange USDT, exchange Bitcoin, exchange Ethereum, track crypto order, QuickXchange" />` |
| 9 | `<meta name="robots" content="index, follow" />` |
| 10 | `<link rel="canonical" href="https://quickchange.exchange/" />` |
| 11 | `<meta property="og:site_name" content="QuickXchange" />` |
| 12 | `<meta property="og:title" content="QuickXchange &#124; Crypto Swap and Conversion Platform" />` |
| 13 | `<meta property="og:description" content="Swap supported crypto and fiat routes, convert digital assets, and track exchange orders with QuickXchange." />` |
| 14 | `<meta property="og:type" content="website" />` |
| 15 | `<meta property="og:url" content="https://quickchange.exchange/" />` |
| 16 | `<meta property="og:locale" content="en_US" />` |
| 17 | `<meta name="twitter:card" content="summary_large_image" />` |
| 18 | `<meta name="twitter:title" content="QuickXchange &#124; Crypto Swap and Conversion Platform" />` |
| 19 | `<meta name="twitter:description" content="Swap supported crypto and fiat routes, convert digital assets, and track exchange orders with QuickXchange." />` |
| 20 | `<script type="application/ld+json">` |
| 26 | `"@id": "https://quickchange.exchange/#organization",` |
| 27, 34, 42 | `"name": "QuickXchange",` |
| 28, 35, 43 | `"url": "https://quickchange.exchange/",` |
| 29 | `"logo": "https://quickchange.exchange/brand/quickxchange-mark.png"` |
| 33 | `"@id": "https://quickchange.exchange/#website",` |
| 36 | `"publisher": { "@id": "https://quickchange.exchange/#organization" },` |
| 41 | `"@id": "https://quickchange.exchange/#application",` |
| 48 | `"publisher": { "@id": "https://quickchange.exchange/#organization" }` |

**`artifacts/crypto-exchange-widget/public/robots.txt`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5 | `Sitemap: https://quickchange.exchange/sitemap.xml` |

**`artifacts/crypto-exchange-widget/public/sitemap.xml`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `<url><loc>https://quickchange.exchange/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>` |
| 4 | `<url><loc>https://quickchange.exchange/swap</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>` |
| 5 | `<url><loc>https://quickchange.exchange/convert</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>` |
| 6 | `<url><loc>https://quickchange.exchange/user-manual</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>` |
| 7 | `<url><loc>https://quickchange.exchange/market-rates</loc><changefreq>daily</changefreq><priority>0.8</priority></url>` |
| 8 | `<url><loc>https://quickchange.exchange/crypto-pairs</loc><changefreq>daily</changefreq><priority>0.8</priority></url>` |
| 9 | `<url><loc>https://quickchange.exchange/status</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>` |
| 10 | `<url><loc>https://quickchange.exchange/how-it-works</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>` |
| 11 | `<url><loc>https://quickchange.exchange/faq</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>` |
| 12 | `<url><loc>https://quickchange.exchange/blog</loc><changefreq>daily</changefreq><priority>0.8</priority></url>` |
| 13 | `<url><loc>https://quickchange.exchange/about</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>` |
| 14 | `<url><loc>https://quickchange.exchange/affiliates</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>` |
| 15 | `<url><loc>https://quickchange.exchange/contact</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>` |
| 16 | `<url><loc>https://quickchange.exchange/operations</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>` |
| 17 | `<url><loc>https://quickchange.exchange/aml-kyc</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>` |
| 18 | `<url><loc>https://quickchange.exchange/privacy</loc><changefreq>yearly</changefreq><priority>0.4</priority></url>` |
| 19 | `<url><loc>https://quickchange.exchange/terms</loc><changefreq>yearly</changefreq><priority>0.4</priority></url>` |

**`artifacts/quickxchange-telegram-mini-app/index.html`**

| Exact line(s) | Value / excerpt |
|---|---|
| 4 | `<meta charset="UTF-8" />` |
| 5 | `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />` |
| 6 | `<title>QuickXchange Telegram Mini App</title>` |
| 7 | `<meta name="description" content="QuickXchange Telegram Mini App — built on Replit. Update this description to reflect the app." />` |
| 8 | `<meta name="robots" content="index, follow" />` |
| 9 | `<meta property="og:title" content="QuickXchange Telegram Mini App" />` |
| 10 | `<meta property="og:description" content="QuickXchange Telegram Mini App — built on Replit. Update this description to reflect the app." />` |
| 11 | `<meta property="og:type" content="website" />` |
| 12 | `<meta name="twitter:card" content="summary_large_image" />` |
| 13 | `<meta name="twitter:title" content="QuickXchange Telegram Mini App" />` |
| 14 | `<meta name="twitter:description" content="QuickXchange Telegram Mini App — built on Replit. Update this description to reflect the app." />` |

### Seed/config migration entry point


**`lib/db/migrations/0016_dynamic_fiat_currencies.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 13 | `INSERT INTO "fiat_currencies" ("id", "code", "name", "network", "precision", "enabled")` |

**`lib/db/migrations/0017_manual_desk_pricing_rules.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 39 | `INSERT INTO "manual_desk_pricing_rules" (` |

**`lib/db/migrations/0018_payment_methods_settlement_v2.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 66 | `INSERT INTO "payment_methods" ("id", "name", "description", "display_order")` |

**`lib/db/migrations/0019_manual_crypto_catalog_settlement.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 66, 81 | `INSERT INTO "crypto_assets" ("id", "code", "name", "decimals", "enabled", "display_order")` |
| 87 | `INSERT INTO "crypto_asset_networks" ("id","asset_id","network_code","network_name","decimals","enabled","customer_deposits_enabled","display_order","requires_memo","required_confirmations","deposit_warning")` |
| 102 | `INSERT INTO "crypto_asset_networks" (` |

**`lib/db/migrations/0028_manual_desk_full_activation.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `INSERT INTO "fiat_currencies"` |
| 10 | `UPDATE "fiat_currencies"` |
| 14 | `UPDATE "payment_methods"` |
| 47 | `UPDATE "crypto_assets"` |
| 51 | `UPDATE "crypto_asset_networks"` |
| 55 | `UPDATE "manual_desk_pricing_rules"` |
| 71 | `INSERT INTO "manual_desk_pricing_rules"` |

**`lib/db/migrations/0029_manual_desk_disable_unsupported_trx.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `UPDATE "crypto_asset_networks"` |
| 5 | `UPDATE "crypto_assets"` |

**`lib/db/migrations/0045_monero_crypto_catalog.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `INSERT INTO "crypto_assets"` |
| 9 | `INSERT INTO "crypto_asset_networks"` |

**`lib/db/migrations/0049_seed_site_publication_defaults.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 42 | `INSERT INTO "site_content_audit_logs"` |

**`lib/db/migrations/0078_seed_widget_exchange_information.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `INSERT INTO "site_content_revisions" (` |

**`lib/db/migrations/0079_manual_desk_pricing_crypto_asset_ids.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 8, 17 | `UPDATE "manual_desk_pricing_rules" r` |

**`lib/db/migrations/0089_recover_verified_bep20_usdt_payment.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 6 | `INSERT INTO "blockchain_monitor_networks" (` |

**`lib/db/migrations/0090_configure_manual_swap_blockchain_monitoring.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 4 | `INSERT INTO "blockchain_monitor_networks" (` |

**`lib/db/migrations/0091_notification_settings.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 16 | `INSERT INTO "notification_settings" ("id")` |

**`lib/db/migrations/0098_recover_verified_bep20_usdt_payment.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 29 | `UPDATE blockchain_monitor_networks` |

**`lib/db/migrations/0100_manual_monitoring_readiness_proofs.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 11 | `UPDATE crypto_asset_networks` |

**`lib/db/migrations/0101_configure_ethereum_mainnet_monitor.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `INSERT INTO blockchain_monitor_networks (` |
| 95 | `UPDATE crypto_asset_networks` |

**`lib/db/migrations/0102_ethereum_rpc_scan_range.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 13 | `UPDATE blockchain_monitor_networks` |

**`lib/db/migrations/0103_bsc_monitor_rpc_v2.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `UPDATE blockchain_monitor_networks` |

**`lib/db/migrations/0104_bsc_alchemy_log_range.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `UPDATE blockchain_monitor_networks` |

**`lib/db/migrations/0108_polygon_usdt0_monitor.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5 | `UPDATE crypto_asset_networks` |
| 19 | `INSERT INTO crypto_asset_networks (` |

**`lib/db/migrations/0109_bitcoin_mainnet_monitor.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `INSERT INTO blockchain_monitor_networks (` |

**`lib/db/migrations/0110_bsc_stablecoin_monitor_identities.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 7 | `UPDATE blockchain_monitor_networks` |
| 31 | `UPDATE crypto_asset_networks` |

**`lib/db/migrations/0111_remove_bitcoin_test_receiving_address.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `UPDATE crypto_asset_networks` |

**`lib/db/migrations/0112_configure_tron_mainnet_monitor.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `UPDATE crypto_asset_networks` |
| 10 | `INSERT INTO blockchain_monitor_networks (` |

**`lib/db/migrations/0113_reconcile_production_tron_monitor.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `UPDATE crypto_asset_networks` |
| 10 | `INSERT INTO blockchain_monitor_networks (` |
| 71 | `UPDATE blockchain_monitor_networks` |

**`lib/db/migrations/0114_restore_tron_endpoint_reference.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `UPDATE blockchain_monitor_networks` |

**`lib/db/migrations/0115_restore_polygon_mainnet_reference.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1 | `UPDATE blockchain_monitor_networks AS monitor` |

**`lib/db/migrations/0133_seed_quickxchange_social_links.sql`**

| Exact line(s) | Value / excerpt |
|---|---|
| 125, 142 | `INSERT INTO "site_content_audit_logs"` |

### Theme token


**`artifacts/crypto-exchange-widget/src/admin-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 7063 | `--affiliate-blue: 37 99% 62%;` |
| 7064 | `--affiliate-violet: 271 91% 65%;` |

**`artifacts/crypto-exchange-widget/src/index.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1985 | `--widget-primary: 208 100% 54%;` |
| 1986 | `--widget-primary-hover: 203 100% 57%;` |
| 1987 | `--widget-bg: 0 0% 100%;` |
| 1988 | `--widget-border: 216 32% 88%;` |
| 1989 | `--widget-input-bg: 216 43% 98%;` |
| 1990 | `--widget-input-border: 216 32% 88%;` |
| 1997 | `--widget-bg: 217 63% 7%;` |
| 1998 | `--widget-border: 217 45% 19%;` |
| 1999 | `--widget-input-bg: 218 57% 10%;` |
| 2000 | `--widget-input-border: 217 45% 19%;` |
| 2419 | `--background: 216 40% 98%;` |
| 2420 | `--foreground: 222 45% 10%;` |
| 2421 | `--border: 216 30% 90%;` |
| 2422 | `--input: 216 35% 94%;` |
| 2423, 2468, 10121 | `--ring: 212 100% 52%;` |
| 2424 | `--success: 150 70% 30%;` |
| 2425 | `--warning: 35 90% 45%;` |
| 2426, 2471 | `--warning-foreground: 0 0% 10%;` |
| 2427, 2472 | `--info: 212 100% 52%;` |
| 2429, 7311 | `--card: 0 0% 100%;` |
| 2430 | `--card-foreground: 222 45% 10%;` |
| 2431 | `--card-border: 216 30% 90%;` |
| 2433, 2478, 10120 | `--primary: 212 100% 52%;` |
| 2434, 2479 | `--primary-foreground: 0 0% 100%;` |
| 2436 | `--secondary: 216 35% 94%;` |
| 2437 | `--secondary-foreground: 222 45% 15%;` |
| 2439 | `--muted: 216 35% 96%;` |
| 2440 | `--muted-foreground: 215 16% 45%;` |
| 2442 | `--accent: 216 30% 92%;` |
| 2443 | `--accent-foreground: 222 45% 10%;` |
| 2445, 2490 | `--destructive: 0 84% 50%;` |
| 2446, 2491 | `--destructive-foreground: 0 0% 100%;` |
| 2448 | `--sidebar: 0 0% 100%;` |
| 2449 | `--sidebar-foreground: 222 45% 10%;` |
| 2450 | `--sidebar-border: 216 30% 90%;` |
| 2451, 2496, 10122 | `--sidebar-primary: 212 100% 52%;` |
| 2452, 2497 | `--sidebar-primary-foreground: 0 0% 100%;` |
| 2453 | `--sidebar-accent: 216 35% 94%;` |
| 2454 | `--sidebar-accent-foreground: 222 45% 10%;` |
| 2464, 15448 | `--background: 217 63% 5%;` |
| 2465 | `--foreground: 220 100% 98%;` |
| 2466 | `--border: 217 45% 19%;` |
| 2467 | `--input: 218 57% 10%;` |
| 2469 | `--success: 150 60% 40%;` |
| 2470 | `--warning: 35 90% 50%;` |
| 2474 | `--card: 217 63% 7%;` |
| 2475 | `--card-foreground: 220 100% 98%;` |
| 2476 | `--card-border: 217 45% 19%;` |
| 2481 | `--secondary: 217 45% 19%;` |
| 2482 | `--secondary-foreground: 220 100% 98%;` |
| 2484 | `--muted: 218 57% 12%;` |
| 2485 | `--muted-foreground: 216 20% 65%;` |
| 2487 | `--accent: 217 45% 19%;` |
| 2488 | `--accent-foreground: 220 100% 98%;` |
| 2493 | `--sidebar: 218 57% 8%;` |
| 2494 | `--sidebar-foreground: 220 100% 98%;` |
| 2495 | `--sidebar-border: 217 45% 19%;` |
| 2498 | `--sidebar-accent: 217 45% 19%;` |
| 2499 | `--sidebar-accent-foreground: 220 100% 98%;` |
| 6065 | `--background: 240 33% 4%;` |
| 6066 | `--foreground: 0 0% 100%;` |
| 6067 | `--primary: 212 100% 50%;` |
| 6068 | `--muted: 240 20% 10%;` |
| 6069 | `--muted-foreground: 240 10% 60%;` |
| 6070 | `--border: 240 20% 15%;` |
| 6071 | `--card: 240 30% 6%;` |
| 7305 | `--background: 0 0% 100%;` |
| 7306 | `--foreground: 226 39% 13%;` |
| 7307 | `--primary: 212 100% 44%;` |
| 7308 | `--muted: 216 24% 96%;` |
| 7309 | `--muted-foreground: 221 15% 42%;` |
| 7310 | `--border: 216 20% 87%;` |
| 7415 | `--background: 219 63% 5%;` |
| 7416, 10125, 15449 | `--foreground: 220 33% 98%;` |
| 7417, 15452 | `--muted: 217 47% 11%;` |
| 7418, 10127 | `--muted-foreground: 224 13% 68%;` |
| 7419 | `--border: 213 34% 18%;` |
| 7420 | `--card: 216 57% 10%;` |
| 9951 | `--primary: 212 100% 48%;` |
| 9952 | `--ring: 212 100% 48%;` |
| 9953 | `--sidebar-primary: 212 100% 48%;` |
| 9954 | `--accent: 266 78% 56%;` |
| 10123 | `--accent: 266 78% 62%;` |
| 10124 | `--background: 236 48% 4%;` |
| 10126 | `--muted: 232 28% 11%;` |
| 10128 | `--border: 229 24% 18%;` |
| 10129 | `--card: 234 38% 7%;` |
| 10130 | `--input: 232 28% 10%;` |
| 10131 | `--sidebar: 234 38% 7%;` |
| 10132 | `--sidebar-border: 229 24% 18%;` |
| 15450 | `--card: 217 47% 11%;` |
| 15451 | `--card-foreground: 220 33% 98%;` |
| 15453 | `--muted-foreground: 221 15% 68%;` |
| 15454 | `--border: 216 36% 20%;` |
| 15455 | `--input: 216 36% 20%;` |
| 19831 | `--background: 225 80% 5%;` |
| 19832 | `--foreground: 218 100% 97%;` |
| 19833 | `--card: 224 72% 9%;` |
| 19834 | `--card-foreground: 218 100% 97%;` |
| 19835 | `--muted: 222 46% 16%;` |
| 19836 | `--muted-foreground: 218 22% 67%;` |
| 19837 | `--border: 218 48% 24%;` |
| 19838 | `--primary: 196 100% 50%;` |
| 19839 | `--primary-foreground: 225 80% 5%;` |
| 19840 | `--success: 158 76% 48%;` |
| 19841 | `--warning: 41 96% 56%;` |
| 19842 | `--destructive: 0 83% 62%;` |

**`artifacts/quickxchange-telegram-mini-app/src/index.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 48 | `--background: 220 20% 98%;` |
| 49 | `--foreground: 220 30% 12%;` |
| 50 | `--border: 220 20% 90%;` |
| 51 | `--input: 220 20% 90%;` |
| 52 | `--ring: 220 85% 55%;` |
| 53 | `--card: 0 0% 100%;` |
| 54 | `--card-foreground: 220 30% 12%;` |
| 55 | `--popover: 0 0% 100%;` |
| 56 | `--popover-foreground: 220 30% 12%;` |
| 59 | `--primary: 215 90% 55%;` |
| 60, 93 | `--primary-foreground: 0 0% 100%;` |
| 63 | `--secondary: 190 90% 50%;` |
| 64, 96 | `--secondary-foreground: 0 0% 100%;` |
| 67 | `--accent: 270 85% 60%;` |
| 68, 99 | `--accent-foreground: 0 0% 100%;` |
| 70 | `--muted: 220 20% 95%;` |
| 71 | `--muted-foreground: 220 20% 45%;` |
| 73 | `--destructive: 350 85% 55%;` |
| 74, 105 | `--destructive-foreground: 0 0% 100%;` |
| 82 | `--background: 230 25% 6%;` |
| 83 | `--foreground: 220 20% 95%;` |
| 84 | `--border: 230 25% 15%;` |
| 85 | `--input: 230 25% 15%;` |
| 86 | `--ring: 220 85% 60%;` |
| 87 | `--card: 230 25% 10%;` |
| 88 | `--card-foreground: 220 20% 95%;` |
| 89 | `--popover: 230 25% 10%;` |
| 90 | `--popover-foreground: 220 20% 95%;` |
| 92 | `--primary: 220 85% 60%;` |
| 95 | `--secondary: 190 85% 50%;` |
| 98 | `--accent: 270 80% 65%;` |
| 101 | `--muted: 230 25% 15%;` |
| 102 | `--muted-foreground: 220 20% 60%;` |
| 104 | `--destructive: 350 85% 60%;` |

### URL / external service / asset source


**`artifacts/api-server/src/lib/manual-desk-rates.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5 | `https://api.1forge.com` |
| 6 | `https://api.coinbase.com/v2/exchange-rates?currency=USD` |
| 8 | `https://api.kraken.com/0/public/Ticker?pair=XMRUSD` |

**`artifacts/api-server/src/lib/newsletter-utils.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 18 | `https://quickxchange.invalid` |

**`artifacts/api-server/src/lib/object-storage.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 6 | `http://127.0.0.1:1106` |
| 292 | `http://www.w3.org/2000/svg` |
| 293 | `http://www.w3.org/1999/xlink` |

**`artifacts/api-server/src/lib/quickex.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 17 | `https://quickex.io/api/v2` |
| 339 | `https://quickex.io/docs/api-v2` |

**`artifacts/api-server/src/lib/telegram-swap-notifications.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 163 | `https://` |

**`artifacts/api-server/src/lib/whitebit-capabilities.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 117, 163 | `https://whitebit.com/api/v4/public/assets` |

**`artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 26 | `https://frontend-api.clerk.dev` |

**`artifacts/api-server/src/routes/notification-settings.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 21 | `https://quickchange.exchange/api/telegram/webhook` |

**`artifacts/api-server/src/routes/whitebit.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 40 | `https://whitebit.com` |

**`artifacts/crypto-exchange-widget/components.json`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `https://ui.shadcn.com/schema.json` |

**`artifacts/crypto-exchange-widget/server.mjs`**

| Exact line(s) | Value / excerpt |
|---|---|
| 329, 348 | `https://schema.org` |
| 414 | `http://localhost` |

**`artifacts/crypto-exchange-widget/src/App.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 598 | `https://api.exchange.coinbase.com/products` |

**`artifacts/crypto-exchange-widget/src/components/error-boundary.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 92 | `http://www.w3.org/2000/svg` |

**`artifacts/crypto-exchange-widget/src/components/payment-method-logo.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 52 | `https://cdn.icard.com/icard.com/img/common/logo.png?53` |
| 94 | `http://www.w3.org/2000/svg` |

**`artifacts/crypto-exchange-widget/src/components/public-shell.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 801 | `http://www.w3.org/2000/svg` |

**`artifacts/crypto-exchange-widget/src/components/shared-app-ui.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 10 | `https://t.me/QuickXchangeNetBot` |

**`artifacts/crypto-exchange-widget/src/components/social-trust-editor.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 347 | `https://your-profile-url` |

**`artifacts/crypto-exchange-widget/src/hooks/use-crypto-market.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 41 | `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h` |

**`artifacts/crypto-exchange-widget/src/lib/telegram-support-value.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 7 | `https://t.me/Quick_change_support` |

**`artifacts/crypto-exchange-widget/src/pages/admin-blog-automation.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 223 | `https://...` |

**`artifacts/crypto-exchange-widget/src/pages/admin-blog-editor.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 576 | `https://...` |

**`artifacts/crypto-exchange-widget/src/pages/admin.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2189 | `https://www.trustpilot.com/review/...` |
| 2568 | `https://quickchange.exchange/status` |
| 2569 | `https://quickchange.exchange/status?invoice=1` |
| 2570 | `https://www.trustpilot.com/review/quickchange.exchange` |
| 10394 | `https://explorer.com/tx/{tx}` |

**`artifacts/crypto-exchange-widget/src/pages/blog-detail.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 168 | `https://schema.org` |

**`artifacts/crypto-exchange-widget/src/pages/blog.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 97 | `https://schema.org` |

**`artifacts/crypto-exchange-widget/src/pages/site-content.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1276 | `https://partner.example` |
| 1672 | `https://example.com/your-profile` |
| 1730 | `https://` |

**`artifacts/crypto-exchange-widget/src/pages/user-manual.tsx`**

| Exact line(s) | Value / excerpt |
|---|---|
| 19, 96 | `https://quickchange.exchange/user-manual` |
| 68 | `https://schema.org` |
| 80, 90 | `https://quickchange.exchange` |

**`artifacts/crypto-exchange-widget/vite.config.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 166 | `http://127.0.0.1:80` |

**`artifacts/quickxchange-telegram-mini-app/components.json`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `https://ui.shadcn.com/schema.json` |

**`artifacts/quickxchange-telegram-mini-app/src/lib/tracking-input.ts`**

| Exact line(s) | Value / excerpt |
|---|---|
| 4 | `https://tracking.invalid` |

### Visual palette / gradient


**`artifacts/crypto-exchange-widget/src/admin-notifications-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `#030712` |
| 3 | `rgba(9, 14, 30, 0.6)` |
| 4 | `rgba(36, 72, 255, 0.2)` |
| 5 | `rgba(19, 221, 244, 0.4)` |
| 6 | `#087BFF` |
| 7 | `#13DDF4` |
| 8 | `#7A2CFF` |
| 12, 169 | `#F8FAFC` |
| 20 | `rgba(8, 123, 255, 0.1)` |
| 30 | `linear-gradient(180deg, rgba(19, 221, 244, 0.03) 0%, transparent 100%)` |
| 42 | `rgba(15, 23, 42, 0.4)` |
| 64 | `rgba(19, 221, 244, 0.6)` |
| 68 | `rgba(148, 163, 184, 0.3)` |
| 79 | `rgba(0,0,0,0.2)` |
| 97, 305 | `#94A3B8` |
| 103, 174, 272 | `rgba(255, 255, 255, 0.05)` |
| 112 | `rgba(15, 23, 42, 0.6)` |
| 113 | `rgba(148, 163, 184, 0.2)` |
| 129, 311 | `rgba(19, 221, 244, 0.2)` |
| 146 | `linear-gradient(135deg, var(--accent-blue), var(--accent-purple))` |
| 148 | `rgba(122, 44, 255, 0.4)` |
| 152, 228 | `rgba(19, 221, 244, 0.5)` |
| 157, 276 | `rgba(36, 72, 255, 0.15)` |
| 158, 223 | `#60A5FA` |
| 159 | `rgba(36, 72, 255, 0.3)` |
| 163 | `rgba(36, 72, 255, 0.25)` |
| 164 | `#93C5FD` |
| 170 | `rgba(255, 255, 255, 0.2)` |
| 183 | `linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 14, 30, 0.95) 100%)` |
| 199 | `linear-gradient(90deg, transparent, var(--accent-cyan), transparent)` |
| 216 | `rgba(16, 185, 129, 0.15)` |
| 217 | `#34D399` |
| 218 | `rgba(16, 185, 129, 0.3)` |
| 222 | `rgba(59, 130, 246, 0.15)` |
| 224 | `rgba(59, 130, 246, 0.3)` |
| 288 | `#CBD5E1` |
| 302 | `rgba(255, 255, 255, 0.1)` |
| 319 | `#f7f9ff` |
| 320 | `#ffffff` |
| 321 | `#f0f4fc` |
| 322 | `#dce5f5` |
| 323 | `#172849` |
| 324 | `#60718e` |
| 325 | `#285ddc` |
| 326 | `#157b59` |
| 327 | `#bf4055` |
| 333 | `#080f20` |
| 334 | `#101b31` |
| 335 | `#0c172a` |
| 336 | `#263953` |
| 337 | `#e9f1ff` |
| 338 | `#9aabc8` |
| 339 | `#83aaff` |
| 340 | `#69d7ac` |
| 341 | `#ff879b` |
| 365 | `#b87912` |
| 366 | `#f5c56b` |
| 383 | `#2357b085` |
| 404, 572 | `#25876013` |
| 405, 572 | `#25876044` |
| 449 | `#6179e8` |
| 450 | `#597df322` |
| 461 | `linear-gradient(120deg,#187ddf,#6757d6)` |
| 462 | `#7285f7` |
| 463 | `#5474ec18` |
| 472 | `#f8fbff` |
| 489 | `#3b6ddd` |
| 491, 520, 549, 610 | `#f9fbff` |
| 496 | `#21886218` |
| 497 | `#c3445a16` |
| 519 | `linear-gradient(120deg,#167ce4,#6054d3)` |
| 531 | `#21886216` |
| 532 | `#21886245` |
| 548 | `linear-gradient(110deg,#1681e9,#5c52d5)` |
| 550, 565 | `#4459cdb0` |
| 557 | `#6686df70` |
| 561, 573 | `#c3445a50` |
| 567, 573 | `#c3445a12` |
| 571 | `#657df1` |
| 583 | `#0d265449` |
| 601 | `#586ef91c` |
| 601 | `#5975e66b` |
| 606, 608 | `#203152` |
| 606 | `#17366818` |
| 609 | `#50627d` |

**`artifacts/crypto-exchange-widget/src/admin-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 9, 34, 58, 150, 153, 159, 675, 744, 749, 835, 906, 947, 998, 1041, 1146, 1159, 1198, 1293, 1315, 1328, 1354, 1409, 1505, 1547, 1662, 1672, 1673, 1746, 1751, 1755, 1765, 1774, 1775, 1875, 1945, 1952, 1969, 1975, 1976, 1977, 1982, 1985, 2056, 2077, 2082, 2154, 2203, 2205, 2207, 2303, 2468, 2559, 2660, 2781, 2863, 2907, 3016, 3119, 3186, 3261, 3279, 3434, 3448, 3478, 3757, 3838, 3848, 3888, 3923, 4134, 4169, 4315, 4349, 4381, 4530, 4650, 4742, 4810, 4924, 5006, 5055, 5070, 5459, 5832, 6440, 6781, 7257, 7277, 7310, 7350, 7381, 7410, 7447, 7525, 7580, 7644, 7708, 7738, 7757, 7783, 7912, 8178, 8216, 8242, 8370, 8396, 8432, 8526, 8555, 8572, 8611, 8620, 8778, 8792, 8801, 8836, 9163, 9208, 9218, 9371, 9420, 9472, 9649, 9714, 9735, 9753, 9926, 9951, 9993, 10040, 10085, 10157, 10401, 10636, 11131, 11503, 11608, 12554, 12588, 12605, 12653, 12666, 12824, 13375, 13429, 13470, 13549, 13557, 13888, 13989, 14023, 14106, 14227, 14236, 14266, 14436, 14462, 14482, 14570, 14577, 14879, 16348, 16393, 16434, 16478, 16500, 16518, 16519, 16520, 16560, 16682, 16752, 17377, 17393 | `hsl(var(--muted-foreground))` |
| 20, 53, 151, 153, 156, 678, 689, 711, 775, 848, 1165, 1204, 1294, 1369, 1441, 1455, 1490, 1514, 1519, 1524, 1574, 1772, 1775, 1791, 1817, 1895, 1978, 1979, 1980, 2098, 2111, 2131, 2135, 2196, 2381, 2800, 3008, 3846, 4124, 4187, 4274, 4287, 4329, 4341, 4378, 4402, 4482, 4638, 4671, 4679, 4686, 4705, 4740, 4921, 4983, 5110, 5431, 6439, 6725, 6738, 6758, 6762, 7094, 7137, 7198, 7267, 7348, 7424, 7456, 7489, 7524, 7642, 7674, 7707, 7732, 7755, 7877, 8093, 8233, 8310, 8327, 8349, 8479, 8500, 8524, 8590, 8628, 8664, 9094, 9115, 9161, 9189, 9235, 9273, 9299, 9340, 9354, 9494, 9598, 9690, 9712, 9751, 9806, 9903, 9913, 9968, 9984, 10011, 10058, 10103, 10174, 10435, 10653, 12503, 12569, 12578, 12602, 12621, 13298, 13371, 13413, 13449, 13455, 13469, 13502, 13510, 13817, 13911, 14029, 14127, 14139, 14155, 14252, 14461, 14484, 14522, 14774, 16217, 16337, 16421, 16437, 16447, 16467, 16494, 16513, 16525, 16533, 16537, 16541, 16566, 16662, 16675, 16702, 16742, 17326, 17433 | `hsl(var(--border))` |
| 22, 16497 | `hsl(var(--muted) / .35)` |
| 41, 1756 | `hsl(var(--primary) / .4)` |
| 42, 153, 156, 774, 847, 1158, 1197, 1489, 1513, 1518, 1523, 1794, 1819, 1852, 2137, 2161, 2592, 2801, 2879, 3069, 3146, 3204, 3380, 3602, 3720, 3796, 3893, 3902, 3937, 3949, 4051, 4189, 4262, 4276, 4380, 4494, 4640, 4673, 4707, 4754, 5433, 6438, 6764, 6788, 7492, 8095, 8198, 8330, 8351, 8481, 8502, 8592, 8666, 8710, 8756, 8870, 9101, 9191, 9288, 9302, 9363, 9905, 9940, 9970, 10014, 10106, 10177, 10318, 10357, 10383, 10566, 10675, 10772, 10784, 10822, 10832, 10851, 10986, 11166, 11976, 12504, 13437, 14251, 14892, 15188, 15221, 15250, 15265, 16360, 16423, 16438, 16526, 16543, 16663, 16705, 17328 | `hsl(var(--card))` |
| 43, 72, 101, 115, 156, 168, 216, 682, 754, 992, 1013, 1076, 1309, 1343, 1396, 1418, 1440, 1456, 1525, 1575, 1747, 1750, 1756, 1772, 1793, 1874, 1897, 1937, 1974, 1981, 1986, 2062, 2083, 2099, 2112, 2118, 2136, 2160, 2384, 2570, 2802, 3109, 3177, 3254, 3269, 3377, 3425, 3455, 3494, 3595, 3601, 3717, 3763, 3777, 3809, 3822, 4007, 4044, 4050, 4143, 4228, 4246, 4307, 4365, 4538, 4659, 4664, 4782, 4908, 4999, 5033, 6441, 6726, 6739, 6745, 6763, 6787, 7092, 7172, 7247, 7285, 7331, 7375, 7458, 7491, 7537, 7568, 7686, 7718, 7832, 7920, 8066, 8164, 8185, 8273, 8312, 8329, 8361, 8407, 8441, 8468, 8492, 8503, 8534, 8565, 8593, 8632, 8667, 8703, 8709, 8737, 8771, 8848, 8890, 9097, 9129, 9169, 9201, 9238, 9276, 9301, 9320, 9413, 9496, 9588, 9640, 9820, 10004, 10028, 10060, 10162, 10168, 10190, 10325, 10382, 11142, 12506, 12540, 12571, 12643, 12793, 13353, 13360, 13438, 13477, 13539, 13898, 14000, 14115, 14217, 14448, 14498, 14564, 14891, 16355, 16359, 16424, 16451, 16517, 16542, 16704, 17304, 17384, 17436 | `hsl(var(--foreground))` |
| 44 | `hsl(var(--foreground) / .07)` |
| 46, 47, 152, 157, 865, 1255, 1475, 1618, 1657, 1663, 1693, 1748, 1753, 1758, 1763, 1764, 1776, 1870, 2017, 2126, 2142, 2834, 3860, 3894, 3995, 5937, 5954, 6442, 6753, 6769, 8157, 8337, 8545, 8570, 8639, 8651, 8673, 8674, 9137, 9329, 9347, 9348, 9405, 9446, 9481, 9593, 9663, 9723, 9945, 10035, 10072, 10215, 10646, 11512, 12520, 12612, 13339, 13972, 14414, 14915, 16367, 16379, 16431, 16457, 16468, 16475, 16496, 16537, 17313, 17332, 17446 | `hsl(var(--primary))` |
| 55, 151 | `hsl(var(--muted) / .24)` |
| 59, 123, 128, 158, 160, 1267, 1482, 1757, 1759, 1761, 2147, 2673, 2767, 2818, 3881, 6445, 6774, 8550, 8657, 9564, 9745, 10395, 12671, 16477, 17339 | `hsl(var(--destructive))` |
| 69 | `rgb(105 92 255 / 0.52)` |
| 71, 15660, 15742 | `rgb(255 255 255 / 0.98)` |
| 74 | `rgb(31 38 135 / 0.18)` |
| 75 | `rgb(41 190 255 / 0.08)` |
| 76 | `rgb(94 92 255 / 0.12)` |
| 83 | `rgb(101 116 255 / 0.58)` |
| 84 | `rgb(8 16 34 / 0.98)` |
| 86 | `rgb(0 0 0 / 0.52)` |
| 87 | `rgb(43 205 255 / 0.08)` |
| 88 | `rgb(100 92 255 / 0.18)` |
| 114 | `linear-gradient(135deg, rgb(31 159 255 / 0.13), rgb(104 74 255 / 0.14))` |
| 119, 592, 1249, 1468, 2646, 2653, 2682, 3874, 6444, 9958, 16474 | `hsl(var(--success))` |
| 127, 2674 | `hsl(var(--destructive) / 0.11)` |
| 134 | `linear-gradient(90deg, transparent, rgb(104 92 255 / 0.36), transparent)` |
| 152, 1748, 1756, 12611, 12613, 16458, 17443 | `hsl(var(--primary) / .08)` |
| 163 | `linear-gradient(135deg, #13DDF4, #087BFF, #2448FF, #7A2CFF)` |
| 164 | `linear-gradient(135deg, #24E5FA, #1986FF, #3556FF, #8B40FF)` |
| 165, 6490 | `rgba(8, 123, 255, 0.4)` |
| 167, 665, 2113, 2121, 3506, 4688, 6740, 6748, 8313, 8428, 9343, 10594, 10954, 16469 | `hsl(var(--background))` |
| 213, 2876, 9391 | `hsl(var(--primary) / 0.22)` |
| 215, 9330 | `hsl(var(--primary) / 0.09)` |
| 429 | `rgba(113, 215, 194, 0.12)` |
| 430 | `rgba(113, 215, 194, 0.36)` |
| 431 | `#d8fff3` |
| 566, 15828 | `hsl(var(--sidebar))` |
| 567 | `hsl(var(--sidebar-border))` |
| 571 | `hsl(var(--sidebar-foreground) / 0.5)` |
| 575 | `hsl(var(--sidebar-foreground) / 0.7)` |
| 579 | `hsl(var(--sidebar-foreground))` |
| 583 | `hsl(var(--sidebar-foreground) / 0.6)` |
| 593 | `hsl(var(--success) / 0.8)` |
| 597, 620 | `hsl(var(--sidebar-accent))` |
| 598 | `hsl(var(--sidebar-accent-foreground))` |
| 603, 611, 1764, 1776, 8675, 9342 | `hsl(var(--primary-foreground))` |
| 606 | `rgba(8, 123, 255, 0.9)` |
| 607 | `rgba(122, 44, 255, 0.9)` |
| 677, 708, 12791 | `rgb(10 21 38)` |
| 683, 1012, 1292, 1327, 1449, 1454, 1582, 1986, 1994, 2057, 2107, 2829, 3395, 3449, 3552, 3596, 3726, 3758, 3778, 3849, 3996, 4045, 5032, 6074, 6118, 6212, 6447, 6734, 8131, 8179, 8235, 8367, 8509, 8704, 8837, 9164, 9372, 9447, 9915, 12570, 12580, 12604, 12623, 12812, 12832, 13153, 13454, 13476, 13897, 14116, 14162, 15256, 15271, 16677 | `hsl(var(--muted))` |
| 687 | `hsl(var(--background) / 0.8)` |
| 766, 786 | `#087BFF` |
| 813 | `#13DDF4` |
| 814 | `rgba(19, 221, 244, 0.1)` |
| 851 | `rgba(0,0,0,0.08))` |
| 968, 1172, 1551, 1558, 2449, 11125 | `hsl(var(--border) / 0.5)` |
| 979, 1605, 6034, 6084, 6175, 6886 | `rgba(16, 185, 129, 0.1)` |
| 980, 6562, 6887, 6899 | `#10B981` |
| 1179, 2661, 6003, 6446, 7351, 13509, 14857 | `hsl(var(--muted) / 0.5)` |
| 1211, 5304, 5447 | `hsl(var(--border) / 0.55)` |
| 1224 | `hsl(var(--muted) / 0.36)` |
| 1228 | `rgb(36 72 255 / 0.62)` |
| 1248, 1467, 2647, 2683, 9959 | `hsl(var(--success) / 0.1)` |
| 1250, 1469 | `hsl(var(--success) / 0.2)` |
| 1254, 1474, 9482, 10091 | `hsl(var(--primary) / 0.1)` |
| 1256, 1476, 5939, 9936 | `hsl(var(--primary) / 0.2)` |
| 1260 | `rgba(139, 92, 246, 0.1)` |
| 1261 | `#8B5CF6` |
| 1262 | `rgba(139, 92, 246, 0.2)` |
| 1266, 1481, 9565 | `hsl(var(--destructive) / 0.1)` |
| 1268, 1483 | `hsl(var(--destructive) / 0.2)` |
| 1272 | `hsl(var(--warning) / 0.15)` |
| 1273, 2666, 5048, 16476, 16551 | `hsl(var(--warning))` |
| 1274 | `hsl(var(--warning) / 0.25)` |
| 1278 | `rgba(249, 115, 22, 0.11)` |
| 1279 | `#c2410c` |
| 1280 | `rgba(234, 88, 12, 0.48)` |
| 1281 | `rgba(249, 115, 22, 0.42)` |
| 1285 | `rgba(249, 115, 22, 0.14)` |
| 1286 | `#fb923c` |
| 1287 | `rgba(251, 146, 60, 0.52)` |
| 1288 | `rgba(249, 115, 22, 0.5)` |
| 1370 | `linear-gradient(to right, rgba(8, 123, 255, 0.08), transparent)` |
| 1371, 1429, 1533, 1619, 5863 | `rgba(8, 123, 255, 0.2)` |
| 1423, 2100, 2892, 3607, 3939, 4032, 5990, 6123, 6519, 6727, 6952, 7107, 7289, 7770, 8715, 8854, 9003, 9150, 9545, 9808, 10369, 12593, 12805, 13521, 15715 | `#fff` |
| 1450, 1583 | `hsl(var(--muted-foreground) / 0.5)` |
| 1563, 2448, 4733, 5978, 15194, 15229 | `hsl(var(--muted) / 0.3)` |
| 1599, 2936, 6014, 6089, 6176 | `rgba(245, 158, 11, 0.1)` |
| 1600, 1664, 5905, 6012, 6090, 6162, 6176, 6189 | `#f59e0b` |
| 1601, 6013, 6189 | `rgba(245, 158, 11, 0.2)` |
| 1606, 5903, 6035, 6085, 6161, 6175, 6188 | `#10b981` |
| 1607, 6036, 6188 | `rgba(16, 185, 129, 0.2)` |
| 1611, 6039, 6079, 6178, 6890 | `rgba(239, 68, 68, 0.1)` |
| 1612, 5904, 6040, 6080, 6164, 6178, 6191 | `#ef4444` |
| 1613, 6041, 6081, 6191 | `rgba(239, 68, 68, 0.2)` |
| 1617, 6510, 16041, 16084, 16153 | `rgba(8, 123, 255, 0.1)` |
| 1652, 1679, 12505 | `hsl(var(--border) / .72)` |
| 1654 | `linear-gradient(145deg, hsl(var(--card)), hsl(var(--muted) / .22))` |
| 1655 | `hsl(230 50% 3% / .1)` |
| 1663, 1776, 2015 | `hsl(var(--primary) / .24)` |
| 1663 | `linear-gradient(145deg, hsl(var(--primary) / .16), hsl(var(--primary) / .05))` |
| 1663 | `hsl(0 0% 100% / .06)` |
| 1664 | `rgb(245 158 11 / .25)` |
| 1664 | `rgb(245 158 11 / .1)` |
| 1665, 10632 | `#fb7185` |
| 1665 | `rgb(251 113 133 / .25)` |
| 1665 | `rgb(251 113 133 / .1)` |
| 1666 | `#34d399` |
| 1666 | `rgb(52 211 153 / .25)` |
| 1666 | `rgb(52 211 153 / .1)` |
| 1668 | `hsl(var(--border) / .64)` |
| 1668 | `linear-gradient(150deg, hsl(var(--card)), hsl(var(--card) / .94))` |
| 1668 | `hsl(230 50% 3% / .07)` |
| 1681 | `hsl(var(--muted) / .27)` |
| 1686 | `hsl(var(--border) / .44)` |
| 1691, 2166, 6793, 16429 | `hsl(var(--primary) / .045)` |
| 1691, 16713 | `hsl(var(--primary) / .6)` |
| 1753, 2018, 17335 | `hsl(var(--primary) / .1)` |
| 1755, 2054 | `hsl(var(--border) / .7)` |
| 1755 | `hsl(var(--background) / .28)` |
| 1757 | `hsl(var(--destructive) / .18)` |
| 1759 | `hsl(var(--destructive) / .3)` |
| 1759 | `hsl(var(--destructive) / .07)` |
| 1761 | `hsl(var(--destructive) / .6)` |
| 1761 | `hsl(var(--destructive) / .14)` |
| 1763, 1994 | `hsl(var(--primary) / .36)` |
| 1763 | `hsl(var(--primary) / .04)` |
| 1764 | `hsl(var(--primary) / .22)` |
| 1765 | `hsl(var(--border) / .45)` |
| 1765 | `hsl(var(--muted) / .12)` |
| 1772, 1821, 8097, 8583 | `hsl(var(--background) / .72)` |
| 1775 | `hsl(var(--background) / .65)` |
| 1803 | `rgb(2 6 23 / .3)` |
| 1822, 8098 | `hsl(225 32% 20% / .14)` |
| 1826, 8102 | `rgb(86 120 255 / .45)` |
| 1827, 8103 | `rgb(5 10 27 / .99)` |
| 1829, 8105 | `rgb(255 255 255 / .04)` |
| 1830, 8106 | `rgb(76 55 255 / .2)` |
| 1851 | `radial-gradient(circle at 88% 0%, hsl(264 82% 58% / .1), transparent 34%)` |
| 1868 | `hsl(var(--primary) / .32)` |
| 1871 | `linear-gradient(145deg, hsl(var(--primary) / .2), hsl(252 84% 58% / .07))` |
| 1872, 2019 | `hsl(var(--primary) / .12)` |
| 1887 | `rgb(202 213 236)` |
| 1898, 1980, 3495, 4008, 5926, 5943, 6448, 8274, 8408, 8442, 8631, 8772, 8783, 9239, 9277 | `hsl(var(--input))` |
| 1958 | `rgb(104 87 255 / .82)` |
| 1959 | `rgb(98 75 255 / .12), 0 10px 28px rgb(61 55 255 / .1)` |
| 1962 | `rgb(126 153 216 / .3)` |
| 1962 | `rgb(245 248 255)` |
| 1962 | `rgb(0 4 16 / .22)` |
| 1978, 7676, 14773 | `hsl(var(--popover))` |
| 1998, 2005 | `linear-gradient(112deg, rgb(19 221 244 / .075), rgb(8 123 255 / .06) 42%, rgb(122 44 255 / .075))` |
| 1999, 2006 | `linear-gradient(125deg, rgb(19 221 244 / .48), rgb(8 123 255 / .44) 48%, rgb(122 44 255 / .48))` |
| 2000, 2007 | `rgb(8 123 255 / .08), 0 0 14px rgb(122 44 255 / .04)` |
| 2033 | `hsl(252 95% 72% / .38)` |
| 2036 | `linear-gradient(125deg, hsl(226 90% 57%), hsl(266 91% 60%))` |
| 2037 | `hsl(252 90% 55% / .22)` |
| 2044 | `rgb(255 255 255 / .76)` |
| 2045 | `hsl(252 90% 55% / .28)` |
| 2062, 17333 | `hsl(var(--primary) / .45)` |
| 2062 | `hsl(var(--primary) / .14)` |
| 2070 | `hsl(214 88% 56% / .18)` |
| 2072 | `linear-gradient(90deg, hsl(213 86% 52% / .11), hsl(226 64% 42% / .08))` |
| 2074 | `hsl(205 96% 64%)` |
| 2074 | `hsl(210 90% 52% / .14)` |
| 2076 | `hsl(208 94% 60%)` |
| 2086 | `rgb(82 112 161 / .22)` |
| 2086 | `linear-gradient(145deg, rgb(8 18 36 / .98), rgb(5 13 28 / .98))` |
| 2086 | `rgb(0 3 12 / .2), inset 0 1px rgb(143 170 255 / .025)` |
| 2087 | `radial-gradient(circle at 88% 0%, rgb(100 59 255 / .15), transparent 38%), linear-gradient(145deg, rgb(7 18 39 / .99), rgb(4 12 27 / .99))` |
| 2088 | `rgb(19 38 70 / .48)` |
| 2089 | `rgb(77 104 151 / .2)` |
| 2090 | `linear-gradient(90deg, rgb(94 66 255 / .09), rgb(18 110 255 / .04))` |
| 2093 | `rgb(83 111 161 / .32)` |
| 2093 | `rgb(4 13 28 / .72)` |
| 2101, 6728 | `hsl(0 0% 100% / .82)` |
| 2106, 6733, 12811, 12830, 15975, 16098, 16126, 16158 | `#087bff` |
| 2117, 6744, 17416 | `hsl(var(--primary) / .2)` |
| 2120, 6747 | `linear-gradient(90deg, hsl(var(--primary) / .08), hsl(265 78% 58% / .045))` |
| 2122, 6749 | `hsl(220 45% 45% / .1), inset 0 1px hsl(0 0% 100% / .9)` |
| 2141, 6768 | `hsl(var(--primary) / .35)` |
| 2143, 6770, 16537 | `hsl(var(--primary) / .07)` |
| 2155, 6782 | `hsl(var(--muted) / .48)` |
| 2196 | `linear-gradient(145deg, hsl(var(--card)), hsl(var(--muted) / .2))` |
| 2196 | `hsl(230 40% 4% / .08)` |
| 2201 | `hsl(var(--background) / .58)` |
| 2383 | `hsl(var(--muted) / 0.55)` |
| 2529, 8739, 9616, 9623 | `linear-gradient(hsl(var(--card)), hsl(var(--card)))` |
| 2530 | `linear-gradient(115deg, hsl(var(--primary)/0.4), rgba(139, 92, 246, 0.4), hsl(var(--info)/0.3))` |
| 2532 | `hsl(var(--primary)/0.6)` |
| 2533 | `rgba(139, 92, 246, 0.5)` |
| 2534, 10518, 10696 | `rgba(255, 255, 255, 0.035)` |
| 2543 | `linear-gradient(90deg, transparent, rgba(37, 134, 255, 0.78), rgba(139, 92, 246, 0.78), transparent)` |
| 2549 | `rgba(90, 116, 155, 0.22)` |
| 2588 | `rgba(var(--provider-accent-rgb), 0.26)` |
| 2591 | `linear-gradient(100deg, rgba(var(--provider-accent-rgb), 0.07), transparent 38%)` |
| 2594 | `rgba(var(--provider-accent-rgb), 0.76)` |
| 2595, 2622 | `rgba(var(--provider-accent-rgb), 0.92)` |
| 2603 | `rgba(var(--provider-accent-rgb), 0.48)` |
| 2605, 2620 | `rgb(var(--provider-accent-rgb))` |
| 2606 | `rgba(var(--provider-accent-rgb), 0.96)` |
| 2607 | `rgba(var(--provider-accent-rgb), 0.82)` |
| 2618 | `rgba(var(--provider-accent-rgb), 0.4)` |
| 2621 | `rgba(var(--provider-accent-rgb), 0.11)` |
| 2645, 2681 | `hsl(var(--success) / 0.32)` |
| 2648 | `hsl(var(--success) / 0.92)` |
| 2652 | `hsl(var(--success) / 0.36)` |
| 2654 | `linear-gradient(105deg, hsl(var(--info) / 0.1), hsl(var(--success) / 0.1))` |
| 2655 | `hsl(var(--success) / 0.94)` |
| 2659 | `hsl(var(--muted-foreground) / 0.3)` |
| 2665 | `hsl(var(--warning) / 0.36)` |
| 2667 | `hsl(var(--warning) / 0.1)` |
| 2668 | `hsl(var(--warning) / 0.9)` |
| 2672 | `hsl(var(--destructive) / 0.4)` |
| 2675 | `hsl(var(--destructive) / 0.96)` |
| 2684 | `hsl(var(--success) / 0.7)` |
| 2691 | `rgba(121, 122, 255, 0.5)` |
| 2693, 2991 | `linear-gradient(110deg, #7c3aed, #2563eb)` |
| 2694 | `rgba(99, 102, 241, 0.9)` |
| 2704 | `rgba(99, 102, 241, 0.96)` |
| 2705 | `rgba(37, 99, 235, 0.95)` |
| 2757 | `hsl(var(--destructive) / 0.25)` |
| 2759 | `hsl(var(--destructive) / 0.055)` |
| 2817 | `hsl(var(--destructive) / 0.75)` |
| 2819, 10394 | `hsl(var(--destructive-foreground))` |
| 2823 | `hsl(var(--destructive) / 0.85)` |
| 2828 | `hsl(var(--primary) / 0.48)` |
| 2847 | `hsl(var(--primary) / 0.32)` |
| 2848 | `hsl(var(--primary) / 0.06)` |
| 2878 | `linear-gradient(115deg, hsl(var(--primary) / 0.07), transparent 42%, hsl(264 82% 58% / 0.05))` |
| 2890 | `rgba(125, 139, 255, 0.58)` |
| 2893 | `linear-gradient(135deg, #2563eb, #7c3aed)` |
| 2894 | `rgba(96, 106, 255, 0.98)` |
| 2927, 2941, 2969 | `rgba(34, 197, 94, 0.34)` |
| 2928, 2942 | `#70e998` |
| 2929, 2943 | `rgba(34, 197, 94, 0.1)` |
| 2930, 2944 | `rgba(34, 197, 94, 0.96)` |
| 2934 | `rgba(245, 158, 11, 0.38)` |
| 2935 | `#ffc35c` |
| 2937 | `rgba(245, 158, 11, 0.94)` |
| 2970 | `#76eba0` |
| 2971 | `rgba(34, 197, 94, 0.08)` |
| 2975 | `rgba(34, 197, 94, 0.98)` |
| 2979 | `rgba(34, 211, 238, 0.3)` |
| 2980 | `#7ee7f2` |
| 2981 | `rgba(34, 211, 238, 0.07)` |
| 2985 | `rgba(34, 211, 238, 0.98)` |
| 2989 | `rgba(120, 113, 255, 0.5)` |
| 2992 | `rgba(99, 102, 241, 0.92)` |
| 3009, 5414 | `hsl(var(--muted) / 0.18)` |
| 3032 | `linear-gradient(90deg, #22d3ee, #3b82f6)` |
| 3033 | `rgba(34, 211, 238, 0.8)` |
| 3040 | `#67e8f9` |
| 3065 | `rgba(var(--customer-stat-rgb), 0.28)` |
| 3068 | `linear-gradient(145deg, rgba(var(--customer-stat-rgb), 0.075), transparent 48%)` |
| 3070 | `rgba(var(--customer-stat-rgb), 0.94)` |
| 3088 | `rgba(var(--customer-stat-rgb), 0.52)` |
| 3089 | `rgba(var(--customer-stat-rgb), 0.98), 0 0 18px -13px rgba(var(--customer-stat-rgb), 0.9)` |
| 3100 | `rgba(var(--customer-stat-rgb), 0.4)` |
| 3102 | `rgb(var(--customer-stat-rgb))` |
| 3103 | `rgba(var(--customer-stat-rgb), 0.11)` |
| 3104 | `rgba(var(--customer-stat-rgb), 0.95)` |
| 3142 | `rgba(var(--volume-accent-rgb), 0.25)` |
| 3145 | `linear-gradient(145deg, rgba(var(--volume-accent-rgb), 0.06), transparent 42%)` |
| 3147 | `rgba(var(--volume-accent-rgb), 0.92)` |
| 3168 | `rgba(var(--volume-accent-rgb), 0.4)` |
| 3170 | `rgb(var(--volume-accent-rgb))` |
| 3171 | `rgba(var(--volume-accent-rgb), 0.1)` |
| 3172 | `rgba(var(--volume-accent-rgb), 0.94)` |
| 3202 | `rgba(var(--volume-accent-rgb), 0.14)` |
| 3209 | `rgba(var(--volume-accent-rgb), 0.34)` |
| 3210 | `rgba(var(--volume-accent-rgb), 0.9)` |
| 3222 | `rgba(var(--volume-accent-rgb), 0.42))` |
| 3225 | `rgba(247, 147, 26, 0.52))` |
| 3226 | `rgba(98, 126, 234, 0.56))` |
| 3227 | `rgba(38, 161, 123, 0.54))` |
| 3228 | `rgba(39, 117, 202, 0.54))` |
| 3229 | `rgba(153, 69, 255, 0.54))` |
| 3230 | `rgba(240, 185, 11, 0.52))` |
| 3231 | `rgba(239, 0, 49, 0.5))` |
| 3360 | `rgba(2, 6, 16, 0.76)` |
| 3374, 3715, 3794 | `rgba(70, 120, 255, 0.28)` |
| 3379 | `linear-gradient(145deg, rgba(0, 212, 255, 0.035), transparent 38%, rgba(139, 44, 255, 0.045))` |
| 3382 | `hsl(var(--primary)/0.55)` |
| 3383 | `hsl(var(--primary)/0.5)` |
| 3384 | `rgba(255, 255, 255, 0.045)` |
| 3394, 3900 | `rgba(70, 120, 255, 0.18)` |
| 3416 | `rgba(61, 156, 255, 0.42)` |
| 3418, 3744, 8151 | `#68c8ff` |
| 3419, 3745 | `linear-gradient(145deg, rgba(0, 212, 255, 0.14), rgba(139, 44, 255, 0.1))` |
| 3420, 3609, 3746, 3764, 3862, 3941, 4034 | `rgba(22, 139, 255, 0.95)` |
| 3446, 3755, 3892 | `rgba(70, 120, 255, 0.2)` |
| 3454, 3762 | `rgba(70, 150, 255, 0.5)` |
| 3456 | `rgba(22, 139, 255, 0.92)` |
| 3491, 3594, 4043 | `rgba(70, 120, 255, 0.22)` |
| 3501 | `rgba(70, 140, 255, 0.38)` |
| 3505, 4013 | `rgba(22, 139, 255, 0.78)` |
| 3507, 4014 | `rgba(22, 139, 255, 0.1), 0 0 14px -9px rgba(139, 44, 255, 0.9)` |
| 3511, 6050, 12816, 12820, 15675, 15708 | `#64748b` |
| 3545, 10568 | `rgba(22, 139, 255, 0.8)` |
| 3550, 3922 | `rgba(70, 120, 255, 0.15)` |
| 3564 | `#7dd3fc` |
| 3574 | `linear-gradient(90deg, rgba(22, 139, 255, 0.34), transparent)` |
| 3600, 4049 | `rgba(70, 140, 255, 0.45)` |
| 3606 | `rgba(86, 143, 255, 0.52)` |
| 3608, 3940, 4033, 8716 | `linear-gradient(110deg, #00d4ff, #168bff 48%, #8b2cff)` |
| 3615, 4039 | `rgba(22, 139, 255, 0.95), 0 0 17px -11px rgba(139, 44, 255, 0.94)` |
| 3719 | `linear-gradient(145deg, rgba(0, 212, 255, 0.025), transparent 35%, rgba(139, 44, 255, 0.04))` |
| 3721 | `rgba(2, 6, 16, 0.68), 0 0 32px -24px rgba(22, 139, 255, 0.8), 0 0 28px -24px rgba(139, 44, 255, 0.88)` |
| 3725, 10702 | `rgba(70, 120, 255, 0.16)` |
| 3742 | `rgba(61, 156, 255, 0.4)` |
| 3775, 4004 | `rgba(70, 120, 255, 0.24)` |
| 3797 | `rgba(2, 6, 16, 0.9), 0 0 20px -15px rgba(139, 44, 255, 0.85)` |
| 3823 | `linear-gradient(90deg, rgba(22, 139, 255, 0.16), rgba(139, 44, 255, 0.12))` |
| 3859 | `rgba(22, 139, 255, 0.58)` |
| 3861 | `rgba(22, 139, 255, 0.14)` |
| 3866 | `rgba(139, 44, 255, 0.58)` |
| 3867 | `hsl(264 76% 48%)` |
| 3868 | `rgba(139, 44, 255, 0.14)` |
| 3869 | `rgba(139, 44, 255, 0.95)` |
| 3873 | `rgba(16, 185, 129, 0.52)` |
| 3875 | `rgba(16, 185, 129, 0.13)` |
| 3876 | `rgba(16, 185, 129, 0.9)` |
| 3880 | `rgba(239, 68, 68, 0.52)` |
| 3882 | `rgba(239, 68, 68, 0.12)` |
| 3883 | `rgba(239, 68, 68, 0.86)` |
| 3887 | `rgba(61, 156, 255, 0.2)` |
| 3903 | `rgba(255, 255, 255, 0.035), 0 16px 34px -28px rgba(2, 6, 16, 0.9)` |
| 3907, 10672 | `rgba(139, 44, 255, 0.28)` |
| 3908 | `rgba(139, 44, 255, 0.72), 0 16px 34px -28px rgba(139, 44, 255, 0.75)` |
| 3912 | `rgba(0, 212, 255, 0.25)` |
| 3913 | `rgba(0, 212, 255, 0.68), 0 16px 34px -28px rgba(0, 212, 255, 0.7)` |
| 3924, 3959, 4658, 9986 | `hsl(var(--muted) / 0.72)` |
| 3929, 10732 | `#a78bfa` |
| 3930 | `#22d3ee` |
| 3947 | `rgba(70, 120, 255, 0.17)` |
| 3950, 10327, 10989, 11066 | `rgba(255, 255, 255, 0.025)` |
| 3958 | `rgba(70, 120, 255, 0.14)` |
| 3974 | `linear-gradient(#168bff, rgba(139, 44, 255, 0.3))` |
| 3993 | `rgba(70, 145, 255, 0.38)` |
| 3997 | `rgba(22, 139, 255, 0.9)` |
| 4031 | `rgba(86, 143, 255, 0.5)` |
| 4126 | `linear-gradient(110deg, hsl(var(--card)), hsl(var(--muted) / 0.45))` |
| 4127, 4159, 4387 | `#7a2cff` |
| 4156, 12836 | `rgb(122 44 255 / 0.22)` |
| 4158 | `rgb(122 44 255 / 0.08)` |
| 4165 | `rgb(122 44 255 / 0.15)` |
| 4190 | `rgb(15 23 42 / 0.08)` |
| 4206 | `rgb(6 182 212 / 0.3)` |
| 4207 | `linear-gradient(135deg, rgb(6 182 212 / 0.08), hsl(var(--card)) 64%)` |
| 4211 | `#06b6d4` |
| 4215 | `rgb(139 44 255 / 0.3)` |
| 4216 | `linear-gradient(135deg, rgb(139 44 255 / 0.08), hsl(var(--card)) 64%)` |
| 4220, 10132, 10309 | `#8b2cff` |
| 4264, 4298 | `linear-gradient(135deg, #2448ff, #7a2cff)` |
| 4265 | `rgb(49 46 129 / 0.3)` |
| 4277, 5125 | `rgb(15 23 42 / 0.06)` |
| 4288 | `linear-gradient(90deg, rgb(122 44 255 / 0.07), transparent)` |
| 4299 | `rgb(66 65 207 / 0.24)` |
| 4331, 7734, 10703 | `hsl(var(--muted) / 0.16)` |
| 4386 | `rgb(122 44 255 / 0.35)` |
| 4405 | `rgb(15 23 42 / 0.03)` |
| 4421 | `rgb(36 72 255 / 0.25)` |
| 4423 | `rgb(36 72 255 / 0.08)` |
| 4424, 4793 | `#2448ff` |
| 4430 | `rgb(36 72 255 / 0.14)` |
| 4439 | `rgb(14 165 233 / 0.22)` |
| 4441 | `rgb(14 165 233 / 0.08)` |
| 4442 | `rgb(3 105 161)` |
| 4446 | `rgb(125 211 252)` |
| 4492 | `rgb(59 130 246 / 0.7)` |
| 4495 | `rgb(37 99 235)` |
| 4502 | `rgb(16 185 129)` |
| 4503, 7192, 7612 | `rgb(16 185 129 / 0.12)` |
| 4504 | `rgb(5 150 105)` |
| 4508 | `rgb(245 158 11)` |
| 4509 | `rgb(245 158 11 / 0.13)` |
| 4510 | `rgb(245 158 11 / 0.1)` |
| 4511 | `rgb(217 119 6)` |
| 4516 | `linear-gradient(rgb(16 185 129), rgb(59 130 246 / 0.55))` |
| 4547 | `rgb(245 158 11 / 0.3)` |
| 4549, 7193 | `rgb(245 158 11 / 0.12)` |
| 4550 | `rgb(180 83 9)` |
| 4559 | `rgb(253 186 116)` |
| 4563 | `rgb(239 68 68 / 0.3)` |
| 4564, 7624 | `rgb(239 68 68 / 0.12)` |
| 4565 | `rgb(220 38 38)` |
| 4641, 5434 | `rgb(15 23 42 / 0.05)` |
| 4663 | `linear-gradient(135deg, rgb(8 123 255 / 0.14), rgb(122 44 255 / 0.15))` |
| 4665 | `rgb(36 72 255 / 0.18)` |
| 4674 | `rgb(15 23 42 / 0.07)` |
| 4680 | `linear-gradient(105deg, hsl(var(--muted) / 0.48), hsl(var(--card)))` |
| 4693 | `rgb(36 72 255 / 0.5)` |
| 4694 | `rgb(36 72 255 / 0.09)` |
| 4712 | `rgb(36 72 255 / 0.3)` |
| 4713 | `hsl(var(--muted) / 0.66)` |
| 4753, 10860, 15220 | `hsl(var(--border) / 0.7)` |
| 4763, 8469 | `hsl(var(--muted) / 0.42)` |
| 4779 | `rgb(36 72 255 / 0.16)` |
| 4781 | `rgb(36 72 255 / 0.06)` |
| 4791 | `rgb(36 72 255 / 0.38)` |
| 4792 | `rgb(36 72 255 / 0.11)` |
| 4923, 4985, 7100 | `hsl(var(--muted) / 0.7)` |
| 4962 | `hsl(var(--muted-foreground) / 0.7)` |
| 5111 | `hsl(var(--muted) / 0.24)` |
| 5119 | `rgb(36 72 255 / 0.72)` |
| 5849, 5909, 6137, 6235 | `hsl(var(--staff-card-bg))` |
| 5850, 5910, 5917, 5927, 5944, 5963, 5969, 6069, 6100, 6138, 6145, 6153, 6233, 6243, 6265 | `hsl(var(--staff-card-border))` |
| 5861, 9168 | `hsl(var(--primary) / 0.5)` |
| 5885, 5961, 6068, 6076, 6114, 6132, 6196, 6271 | `hsl(var(--staff-muted))` |
| 5892, 5932, 5949, 5971, 6004, 6075, 6119, 6247, 6280 | `hsl(var(--staff-text))` |
| 5906, 6163, 6177, 6190 | `#3b82f6` |
| 6007 | `#6366f1` |
| 6008 | `rgba(99, 102, 241, 0.2)` |
| 6009 | `linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(124, 58, 237, 0.1))` |
| 6044 | `rgba(148, 163, 184, 0.12)` |
| 6045 | `#94a3b8` |
| 6046 | `rgba(148, 163, 184, 0.22)` |
| 6049 | `rgba(100, 116, 139, 0.12)` |
| 6051 | `rgba(100, 116, 139, 0.2)` |
| 6056 | `#6d3cff` |
| 6086 | `rgba(16, 185, 129, 0.25)` |
| 6091 | `rgba(245, 158, 11, 0.25)` |
| 6177 | `rgba(59, 130, 246, 0.1)` |
| 6190 | `rgba(59, 130, 246, 0.2)` |
| 6226 | `rgb(2 6 23 / 0.7)` |
| 6236 | `rgb(0 0 0 / 0.38)` |
| 6443 | `#7A2CFF` |
| 6499, 6951 | `linear-gradient(135deg, var(--accent-blue), var(--accent-purple))` |
| 6500 | `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)` |
| 6520 | `rgba(8, 123, 255, 0.5)` |
| 6561 | `rgba(8, 123, 255, 0.15)` |
| 6561 | `#3B82F6` |
| 6562 | `rgba(16, 185, 129, 0.15)` |
| 6563 | `rgba(239, 68, 68, 0.15)` |
| 6563, 6891, 6900 | `#EF4444` |
| 6564 | `rgba(122, 44, 255, 0.15)` |
| 6564 | `#A855F7` |
| 6848, 6859 | `color-mix(in srgb, var(--accent-blue) 10%, transparent)` |
| 6849 | `color-mix(in srgb, var(--accent-blue) 22%, transparent)` |
| 6867 | `#d97706` |
| 6868 | `rgba(217, 119, 6, .12)` |
| 6873 | `rgba(239, 68, 68, .1)` |
| 7093 | `hsl(var(--card) / 0.78)` |
| 7095 | `rgb(15 23 42 / 0.45)` |
| 7099 | `hsl(var(--affiliate-blue) / 0.42)` |
| 7109 | `linear-gradient(125deg, #1774ff 0%, #5b4dff 48%, #9238ed 100%)` |
| 7110 | `rgb(83 70 255 / 0.85)` |
| 7118 | `linear-gradient(125deg, #3292ff 0%, #695cff 45%, #aa48fa 100%)` |
| 7140 | `radial-gradient(circle at 100% 0%, hsl(var(--affiliate-violet) / 0.075), transparent 46%)` |
| 7141 | `linear-gradient(145deg, hsl(var(--card)), hsl(var(--muted) / 0.26))` |
| 7142 | `rgb(15 23 42 / 0.48)` |
| 7147, 7205 | `rgb(116 143 184 / 0.18)` |
| 7149 | `radial-gradient(circle at 100% 0%, rgb(104 75 255 / 0.15), transparent 44%)` |
| 7150 | `linear-gradient(145deg, rgb(10 21 39 / 0.98), rgb(5 13 27 / 0.98))` |
| 7151 | `rgb(255 255 255 / 0.025), 0 16px 38px -26px rgb(0 0 0 / 0.9)` |
| 7159 | `linear-gradient(180deg, #438cff, #8b5cf6)` |
| 7165 | `hsl(var(--affiliate-violet) / 0.42)` |
| 7166 | `hsl(var(--affiliate-violet) / 0.45)` |
| 7190 | `#9b62ff` |
| 7190 | `rgb(139 92 246 / 0.12)` |
| 7191 | `#438cff` |
| 7191 | `rgb(37 99 235 / 0.12)` |
| 7192 | `#2fd49c` |
| 7193 | `#f4b84a` |
| 7200, 9116 | `hsl(var(--card) / 0.94)` |
| 7201 | `rgb(15 23 42 / 0.58)` |
| 7207 | `radial-gradient(circle at 100% 0%, rgb(69 65 156 / 0.1), transparent 42%)` |
| 7208 | `rgb(6 15 29 / 0.94)` |
| 7209 | `rgb(255 255 255 / 0.025), 0 20px 48px -32px rgb(0 0 0 / 0.92)` |
| 7242 | `#7d63ff` |
| 7269, 7500, 9600 | `hsl(var(--muted) / 0.45)` |
| 7290 | `linear-gradient(135deg, #246fff, #8153ee)` |
| 7291 | `rgb(85 75 255 / 0.9)` |
| 7330, 7536, 10316 | `hsl(var(--border) / 0.72)` |
| 7336 | `hsl(var(--affiliate-violet) / 0.24)` |
| 7338 | `hsl(var(--affiliate-violet) / 0.055)` |
| 7356 | `#ffe39a` |
| 7356 | `rgb(245 184 74 / 0.35)` |
| 7356 | `rgb(245 184 74 / 0.12)` |
| 7357 | `#b6cbef` |
| 7357 | `rgb(148 163 184 / 0.32)` |
| 7357 | `rgb(148 163 184 / 0.11)` |
| 7358 | `#e5a677` |
| 7358 | `rgb(194 115 65 / 0.3)` |
| 7358 | `rgb(194 115 65 / 0.1)` |
| 7393 | `#6d78ff` |
| 7400 | `#9a5cff` |
| 7415 | `hsl(var(--affiliate-violet) / 0.5)` |
| 7426 | `hsl(var(--muted) / 0.15)` |
| 7459, 10947 | `hsl(var(--background) / 0.82)` |
| 7478 | `hsl(var(--affiliate-violet) / 0.62)` |
| 7479, 7827 | `hsl(var(--affiliate-violet) / 0.1)` |
| 7499 | `hsl(var(--affiliate-blue) / 0.38)` |
| 7526 | `hsl(var(--muted) / 0.25)` |
| 7547 | `linear-gradient(90deg, hsl(var(--affiliate-blue) / 0.045), hsl(var(--affiliate-violet) / 0.05))` |
| 7548 | `hsl(var(--affiliate-violet) / 0.6)` |
| 7564 | `#7657f5` |
| 7576 | `#7a6aff` |
| 7590 | `#20bb86` |
| 7610 | `#29cd94` |
| 7611 | `rgb(41 205 148 / 0.28)` |
| 7616 | `#79a9e8` |
| 7617 | `rgb(96 165 250 / 0.24)` |
| 7618 | `rgb(59 130 246 / 0.1)` |
| 7622 | `#ff7b86` |
| 7623 | `rgb(248 113 113 / 0.28)` |
| 7645 | `hsl(var(--background) / 0.65)` |
| 7653 | `#8068ff` |
| 7654 | `hsl(var(--affiliate-violet) / 0.4)` |
| 7655 | `hsl(var(--affiliate-violet) / 0.07)` |
| 7677 | `rgb(2 6 23 / 0.75)` |
| 7692, 7765 | `#7b68ff` |
| 7693 | `hsl(var(--muted) / 0.65)` |
| 7714, 7809 | `hsl(var(--affiliate-violet) / 0.48)` |
| 7758 | `hsl(var(--background) / 0.68)` |
| 7766 | `hsl(var(--affiliate-violet) / 0.38)` |
| 7772 | `linear-gradient(135deg, #2876ff, #8254ed)` |
| 7773 | `rgb(92 73 255 / 0.9)` |
| 7804 | `hsl(var(--affiliate-violet) / 0.22)` |
| 7807 | `radial-gradient(circle at 84% 20%, hsl(var(--affiliate-violet) / 0.14), transparent 28%)` |
| 7808 | `linear-gradient(115deg, hsl(var(--card)), hsl(var(--affiliate-blue) / 0.055), hsl(var(--affiliate-violet) / 0.075))` |
| 7814 | `radial-gradient(circle at 84% 20%, rgb(124 58 237 / 0.2), transparent 30%)` |
| 7815 | `linear-gradient(115deg, rgb(7 17 32), rgb(8 21 45), rgb(17 14 49))` |
| 7824 | `hsl(var(--affiliate-violet) / 0.28)` |
| 7826 | `#8f67ff` |
| 7879 | `hsl(var(--background) / 0.45)` |
| 7902 | `hsl(var(--border) / 0.75)` |
| 8053 | `rgba(2, 6, 16, .76)` |
| 8064 | `rgba(70, 120, 255, .28)` |
| 8067 | `linear-gradient(145deg, rgba(0, 212, 255, .025), transparent 36%, rgba(139, 44, 255, .04)), hsl(var(--card))` |
| 8068 | `rgba(2, 6, 16, .68), 0 0 32px -24px rgba(22, 139, 255, .8), 0 0 28px -24px rgba(139, 44, 255, .88)` |
| 8075 | `rgb(2 6 23 / .38)` |
| 8130 | `rgba(70, 120, 255, .16)` |
| 8149 | `rgba(61, 156, 255, .4)` |
| 8152 | `linear-gradient(145deg, rgba(0, 212, 255, .14), rgba(139, 44, 255, .1))` |
| 8153, 8186, 8717 | `rgba(22, 139, 255, .95)` |
| 8176 | `rgba(70, 120, 255, .2)` |
| 8184 | `rgba(70, 150, 255, .5)` |
| 8196 | `rgba(70, 120, 255, .17)` |
| 8199 | `rgba(255, 255, 255, .03), 0 18px 42px -34px rgba(22, 139, 255, .72)` |
| 8252 | `linear-gradient(135deg, #168bff, #7047eb)` |
| 8271, 8294, 8404, 8439, 8702 | `rgba(70, 120, 255, .22)` |
| 8280, 8427, 8458 | `rgba(22, 139, 255, .78)` |
| 8281 | `rgba(22, 139, 255, .1)` |
| 8296 | `hsl(var(--popover) / .98)` |
| 8298 | `rgb(5 17 42 / .72)` |
| 8299 | `rgb(22 139 255 / .72)` |
| 8360, 8533 | `hsl(var(--border) / .65)` |
| 8368, 8473, 8782, 10117, 10308 | `#168bff` |
| 8384 | `rgb(76 134 255 / .28)` |
| 8385 | `hsl(var(--popover) / .97)` |
| 8387 | `rgb(0 5 20 / .9)` |
| 8388 | `rgb(19 221 244 / .46)` |
| 8429, 8459 | `rgba(22, 139, 255, .1), 0 0 14px -9px rgba(139, 44, 255, .9)` |
| 8466 | `rgba(70, 120, 255, .14)` |
| 8525 | `hsl(var(--muted) / .42)` |
| 8594 | `hsl(var(--foreground) / .16)` |
| 8656 | `hsl(var(--destructive) / .1)` |
| 8708 | `rgba(70, 140, 255, .45)` |
| 8714 | `rgba(86, 143, 255, .5)` |
| 8723 | `rgba(22, 139, 255, .95), 0 0 17px -11px rgba(139, 44, 255, .94)` |
| 8740 | `linear-gradient(125deg, rgb(19 221 244 / .62), rgb(8 123 255 / .68) 48%, rgb(122 44 255 / .66))` |
| 8742 | `rgb(0 4 16 / .42)` |
| 8743 | `rgb(8 123 255 / .08)` |
| 8744 | `rgb(122 44 255 / .52)` |
| 8755 | `rgb(83 111 161 / .28)` |
| 8769 | `rgb(65 132 229 / .48)` |
| 8773 | `rgb(255 255 255 / .025)` |
| 8785 | `rgb(22 139 255 / .14)` |
| 8786 | `rgb(22 139 255 / .5)` |
| 8787 | `rgb(139 44 255 / .66)` |
| 8796 | `#35d4ff` |
| 8834 | `rgb(83 111 161 / .34)` |
| 8847 | `rgb(77 151 255 / .56)` |
| 8849 | `hsl(var(--muted) / 0.8)` |
| 8853 | `rgb(83 175 255 / .68)` |
| 8855 | `linear-gradient(112deg, #09bfed, #087bff 50%, #7a2cff)` |
| 8856 | `rgb(8 123 255 / .9), 0 0 15px -8px rgb(122 44 255 / .86)` |
| 8897 | `rgb(57 135 244 / .36)` |
| 8898 | `linear-gradient(112deg, rgb(19 221 244 / .055), rgb(8 123 255 / .08) 50%, rgb(122 44 255 / .07))` |
| 8899 | `rgb(31 175 255 / .72)` |
| 8904 | `rgb(78 153 255 / .48)` |
| 8905 | `linear-gradient(112deg, rgb(19 221 244 / .1), rgb(8 123 255 / .14) 50%, rgb(122 44 255 / .13))` |
| 8906 | `#20c9ff` |
| 8906 | `rgb(122 44 255 / .9)` |
| 8926 | `rgb(81 130 204 / .34)` |
| 8928 | `#f5f8ff` |
| 8929 | `rgb(0 4 16 / .3)` |
| 8940 | `rgb(59 153 255 / .42)` |
| 8941 | `#39d7ff` |
| 8942 | `linear-gradient(145deg, rgb(18 69 118), rgb(53 31 111))` |
| 8978, 12877 | `#f7faff` |
| 8985, 9012 | `rgb(158 178 207)` |
| 8993 | `rgb(76 137 222)` |
| 9004 | `linear-gradient(135deg, #0ec7ef, #087bff 52%, #7a2cff)` |
| 9005 | `rgb(8 123 255 / .34)` |
| 9099 | `radial-gradient(circle at 8% 0%, hsl(var(--primary) / 0.08), transparent 27%)` |
| 9100 | `radial-gradient(circle at 100% 9%, hsl(264 82% 58% / 0.09), transparent 31%)` |
| 9102 | `hsl(var(--foreground) / 0.18), 0 0 38px hsl(var(--primary) / 0.12)` |
| 9148 | `rgba(85, 204, 255, 0.45)` |
| 9151 | `linear-gradient(145deg, rgba(0, 223, 255, 0.22), rgba(64, 94, 255, 0.3) 55%, rgba(140, 68, 255, 0.28))` |
| 9152 | `rgba(255, 255, 255, 0.14), 0 0 22px rgba(31, 153, 255, 0.2)` |
| 9170, 9664, 9676, 10090, 10216, 14499, 14501 | `hsl(var(--primary) / 0.08)` |
| 9171 | `hsl(var(--primary) / 0.16)` |
| 9256, 10341 | `linear-gradient(45deg, transparent 50%, hsl(var(--muted-foreground)) 50%)` |
| 9257, 10342 | `linear-gradient(135deg, hsl(var(--muted-foreground)) 50%, transparent 50%)` |
| 9287, 9362 | `hsl(var(--primary) / 0.8)` |
| 9289, 9364 | `hsl(var(--primary) / 0.1), 0 0 22px hsl(264 82% 58% / 0.09)` |
| 9303 | `hsl(var(--foreground) / 0.2), 0 0 24px hsl(var(--primary) / 0.1)` |
| 9393 | `linear-gradient(120deg, hsl(var(--primary) / 0.07), hsl(264 82% 58% / 0.06))` |
| 9394 | `hsl(var(--primary) / 0.07)` |
| 9432 | `rgba(83, 170, 255, 0.34)` |
| 9434, 9497, 10061, 10655 | `hsl(var(--muted) / 0.56)` |
| 9444 | `rgba(91, 170, 255, 0.3)` |
| 9479 | `rgba(69, 196, 255, 0.35)` |
| 9518 | `#2ecfff` |
| 9544 | `rgba(125, 225, 255, 0.42)` |
| 9546 | `linear-gradient(105deg, #05cde8 0%, #187dff 49%, #8251ef 100%)` |
| 9547 | `rgba(28, 105, 255, 0.23), 0 0 22px rgba(109, 70, 255, 0.12)` |
| 9552 | `rgba(29, 122, 255, 0.3), 0 0 25px rgba(112, 75, 255, 0.18)` |
| 9563 | `hsl(var(--destructive) / 0.36)` |
| 9584 | `rgba(111, 139, 204, 0.17)` |
| 9617 | `linear-gradient(125deg, rgba(28, 205, 235, 0.4), rgba(48, 126, 255, 0.28) 52%, rgba(130, 81, 239, 0.36))` |
| 9618 | `rgba(21, 75, 155, 0.08), 0 0 22px rgba(65, 143, 255, 0.06)` |
| 9624 | `linear-gradient(125deg, rgba(130, 81, 239, 0.36), rgba(48, 126, 255, 0.28) 52%, rgba(28, 205, 235, 0.4))` |
| 9661 | `hsl(var(--primary) / 0.28)` |
| 9673 | `hsl(var(--primary) / 0.52)` |
| 9675 | `hsl(var(--primary) / 0.13)` |
| 9692, 14483, 14521 | `hsl(var(--muted) / 0.34)` |
| 9703 | `hsl(var(--input) / 0.78)` |
| 9715 | `hsl(var(--card) / 0.72)` |
| 9743 | `hsl(var(--destructive) / 0.24)` |
| 9746 | `hsl(var(--destructive) / 0.07)` |
| 9754 | `hsl(var(--muted) / 0.2)` |
| 9792 | `hsl(var(--primary) / 0.25)` |
| 9794 | `linear-gradient(120deg, hsl(var(--primary) / 0.05), hsl(264 82% 58% / 0.04))` |
| 9816 | `rgba(106, 136, 200, 0.19)` |
| 9939 | `radial-gradient(circle at 0% 0%, hsl(var(--primary) / 0.08), transparent 32%)` |
| 9956 | `hsl(var(--success) / 0.24)` |
| 10013 | `radial-gradient(circle at 100% 0%, hsl(264 82% 58% / 0.07), transparent 30%)` |
| 10070 | `hsl(var(--primary) / 0.24)` |
| 10073 | `linear-gradient(145deg, hsl(var(--primary) / 0.11), hsl(264 82% 58% / 0.1))` |
| 10089, 10351, 10388 | `hsl(var(--primary) / 0.42)` |
| 10105 | `radial-gradient(circle at 100% 0%, var(--overview-kpi-glow, rgba(22, 139, 255, 0.1)), transparent 38%)` |
| 10113 | `linear-gradient(90deg, var(--overview-kpi-accent, #168bff), transparent 78%)` |
| 10118 | `rgba(22, 139, 255, 0.13)` |
| 10122, 10307 | `#00d4ff` |
| 10123 | `rgba(0, 212, 255, 0.12)` |
| 10127, 10310 | `#2dd4a6` |
| 10128 | `rgba(45, 212, 166, 0.1)` |
| 10133 | `rgba(139, 44, 255, 0.12)` |
| 10137, 10311 | `#f2b94b` |
| 10138 | `rgba(242, 185, 75, 0.1)` |
| 10142 | `#f06474` |
| 10143 | `rgba(240, 74, 95, 0.08)` |
| 10149 | `color-mix(in srgb, var(--overview-kpi-accent) 35%, transparent)` |
| 10152 | `color-mix(in srgb, var(--overview-kpi-accent) 11%, transparent)` |
| 10153 | `color-mix(in srgb, var(--overview-kpi-accent) 12%, transparent)` |
| 10176 | `radial-gradient(circle at 100% 0%, hsl(244 100% 64% / 0.05), transparent 30%)` |
| 10213 | `hsl(var(--primary) / 0.26)` |
| 10303 | `#050b16` |
| 10304 | `#07101f` |
| 10305 | `#0b1528` |
| 10306 | `#0d1930` |
| 10312 | `#ef5b6c` |
| 10323 | `hsl(var(--border) / 0.84)` |
| 10326 | `hsl(var(--input) / 0.76)` |
| 10355 | `hsl(var(--primary) / 0.86)` |
| 10358 | `hsl(var(--primary) / 0.12), 0 0 18px -13px rgba(139, 44, 255, 0.85)` |
| 10368 | `rgba(103, 169, 255, 0.48)` |
| 10371 | `rgba(22, 139, 255, 0.92), 0 0 18px -14px rgba(139, 44, 255, 0.84)` |
| 10376 | `rgba(22, 139, 255, 0.96), 0 0 21px -13px rgba(139, 44, 255, 0.9)` |
| 10381, 14321 | `hsl(var(--border) / 0.9)` |
| 10389 | `hsl(var(--muted) / 0.78)` |
| 10393 | `hsl(var(--destructive) / 0.48)` |
| 10420 | `hsl(var(--primary) / 0.035)` |
| 10438 | `radial-gradient(circle at 50% 0%, hsl(var(--primary) / 0.08), transparent 45%)` |
| 10439 | `hsl(var(--muted) / 0.28)` |
| 10443 | `hsl(var(--primary) / 0.64)` |
| 10512 | `rgba(var(--integration-tone), 0.26)` |
| 10514 | `radial-gradient(circle at 100% 0%, rgba(var(--integration-tone), 0.11), transparent 44%)` |
| 10515 | `linear-gradient(145deg, rgba(10, 20, 39, 0.98), rgba(5, 12, 25, 0.98))` |
| 10517 | `rgba(var(--integration-tone), 0.9)` |
| 10524 | `linear-gradient(90deg, rgba(var(--integration-tone-bright), 0.95), rgba(var(--integration-tone), 0.48), transparent)` |
| 10528 | `rgba(var(--integration-tone), 0.46)` |
| 10530 | `rgba(var(--integration-tone), 0.82)` |
| 10531 | `rgba(var(--integration-tone-bright), 0.82)` |
| 10532 | `rgba(255, 255, 255, 0.05)` |
| 10551 | `rgba(var(--integration-tone), 0.28)` |
| 10552 | `rgb(var(--integration-tone-bright))` |
| 10553 | `rgba(var(--integration-tone), 0.1)` |
| 10554 | `rgba(var(--integration-tone-bright), 0.92)` |
| 10558 | `rgb(var(--integration-tone))` |
| 10559 | `rgba(var(--integration-tone), 0.18)` |
| 10563 | `rgba(22, 139, 255, 0.3)` |
| 10565 | `radial-gradient(circle at 15% 0%, rgba(19, 221, 244, 0.055), transparent 31%)` |
| 10569, 11009 | `rgba(139, 44, 255, 0.85)` |
| 10575 | `linear-gradient(115deg, rgba(19, 221, 244, 0.075), rgba(8, 123, 255, 0.045) 52%, rgba(139, 44, 255, 0.075))` |
| 10576 | `hsl(var(--muted) / 0.22)` |
| 10586 | `linear-gradient(90deg, rgba(19, 221, 244, 0.52), rgba(8, 123, 255, 0.34), rgba(139, 44, 255, 0.42))` |
| 10590 | `rgba(19, 221, 244, 0.34)` |
| 10591 | `#3bcaf7` |
| 10593 | `linear-gradient(145deg, rgba(19, 221, 244, 0.14), rgba(8, 123, 255, 0.12) 55%, rgba(139, 44, 255, 0.14))` |
| 10596, 10824 | `rgba(19, 221, 244, 0.95)` |
| 10597 | `rgba(255, 255, 255, 0.08)` |
| 10601 | `rgba(52, 211, 153, 0.4)` |
| 10602 | `#6ee7b7` |
| 10603 | `linear-gradient(135deg, rgba(19, 221, 244, 0.12), rgba(16, 185, 129, 0.14))` |
| 10604 | `rgba(52, 211, 153, 0.92)` |
| 10609 | `linear-gradient(180deg, hsl(var(--card)), hsl(var(--muted) / 0.17))` |
| 10620, 10714, 10724 | `#4adea8` |
| 10624, 10745 | `#45ccf4` |
| 10628, 10754, 10759 | `#f6b94a` |
| 10641 | `radial-gradient(circle at 0 0, rgba(19, 221, 244, 0.045), transparent 32%)` |
| 10642 | `hsl(var(--muted) / 0.12)` |
| 10674 | `radial-gradient(circle at 100% 0%, rgba(139, 44, 255, 0.075), transparent 38%)` |
| 10676 | `rgba(139, 44, 255, 0.82)` |
| 10684 | `rgba(19, 221, 244, 0.26)` |
| 10686 | `#42d4f7` |
| 10687 | `rgba(19, 221, 244, 0.09)` |
| 10688 | `rgba(19, 221, 244, 0.36))` |
| 10692 | `rgba(19, 221, 244, 0.23)` |
| 10694 | `linear-gradient(135deg, rgba(19, 221, 244, 0.075), rgba(8, 123, 255, 0.055))` |
| 10695 | `hsl(var(--muted) / 0.14)` |
| 10715 | `rgba(74, 222, 168, 0.68)` |
| 10719 | `rgba(16, 185, 129, 0.22)` |
| 10728 | `rgba(139, 44, 255, 0.25)` |
| 10733 | `rgba(167, 139, 250, 0.68)` |
| 10737 | `#b9a1ff` |
| 10741 | `rgba(19, 221, 244, 0.22)` |
| 10746 | `rgba(69, 204, 244, 0.68)` |
| 10750 | `rgba(245, 158, 11, 0.24)` |
| 10755 | `rgba(246, 185, 74, 0.58)` |
| 10764 | `rgba(22, 139, 255, 0.98)` |
| 10765 | `rgba(139, 44, 255, 0.92)` |
| 10769 | `rgba(91, 112, 255, 0.32)` |
| 10771 | `linear-gradient(135deg, rgba(8, 123, 255, 0.045), rgba(139, 44, 255, 0.045))` |
| 10776 | `rgba(139, 92, 246, 0.46)` |
| 10777 | `rgba(139, 92, 246, 0.84)` |
| 10781 | `rgba(22, 139, 255, 0.22)` |
| 10783 | `radial-gradient(circle at 50% 0%, rgba(22, 139, 255, 0.055), transparent 36%)` |
| 10789 | `radial-gradient(circle at 50% 38%, rgba(8, 123, 255, 0.075), transparent 24%)` |
| 10790 | `linear-gradient(180deg, hsl(var(--muted) / 0.07), transparent)` |
| 10794 | `rgba(19, 221, 244, 0.25)` |
| 10795 | `#4dcff5` |
| 10796 | `linear-gradient(145deg, rgba(19, 221, 244, 0.1), rgba(8, 123, 255, 0.08), rgba(139, 44, 255, 0.09))` |
| 10798 | `rgba(19, 221, 244, 0.92)` |
| 10799 | `rgba(255, 255, 255, 0.055)` |
| 10817 | `rgba(19, 221, 244, 0.3)` |
| 10819 | `#43d4f6` |
| 10821 | `linear-gradient(145deg, rgba(19, 221, 244, 0.13), rgba(8, 123, 255, 0.12))` |
| 10825 | `rgba(255, 255, 255, 0.07)` |
| 10829 | `rgba(111, 90, 246, 0.37)` |
| 10831 | `linear-gradient(135deg, rgba(8, 123, 255, 0.055), rgba(139, 44, 255, 0.075))` |
| 10836 | `rgba(111, 90, 246, 0.58)` |
| 10837 | `#75d8fa` |
| 10839 | `rgba(8, 123, 255, 0.88)` |
| 10840 | `rgba(139, 44, 255, 0.84)` |
| 10848 | `rgba(8, 123, 255, 0.22)` |
| 10850 | `radial-gradient(circle at 0 0, rgba(19, 221, 244, 0.045), transparent 36%)` |
| 10852, 16057 | `rgba(8, 123, 255, 0.72)` |
| 10946 | `hsl(var(--border) / 0.88)` |
| 10952 | `rgba(19, 221, 244, 0.6)` |
| 10956 | `rgba(8, 123, 255, 0.24)` |
| 10957 | `rgba(19, 221, 244, 0.75)` |
| 10958 | `rgba(139, 44, 255, 0.72)` |
| 10971 | `#49ccef` |
| 10974 | `rgba(19, 221, 244, 0.3))` |
| 10982 | `rgba(19, 180, 235, 0.28)` |
| 10984 | `radial-gradient(circle at 0 0, rgba(19, 221, 244, 0.06), transparent 30%)` |
| 10985 | `radial-gradient(circle at 100% 0, rgba(8, 123, 255, 0.045), transparent 30%)` |
| 10988 | `rgba(19, 221, 244, 0.86)` |
| 10993 | `#4fd3f4` |
| 10994 | `rgba(19, 221, 244, 0.2)` |
| 11006 | `rgba(116, 92, 246, 0.34)` |
| 11007 | `#b8a7ff` |
| 11008 | `linear-gradient(135deg, rgba(8, 123, 255, 0.1), rgba(139, 44, 255, 0.12))` |
| 11019 | `rgba(103, 88, 246, 0.32)` |
| 11021 | `#a997fb` |
| 11022 | `linear-gradient(135deg, rgba(8, 123, 255, 0.07), rgba(139, 44, 255, 0.1))` |
| 11033 | `rgba(139, 92, 246, 0.58)` |
| 11034 | `#c7bbff` |
| 11035 | `rgba(139, 92, 246, 0.92)` |
| 11040 | `rgba(19, 221, 244, 0.45)` |
| 11041 | `#55d9f6` |
| 11042 | `linear-gradient(135deg, rgba(19, 221, 244, 0.11), rgba(8, 123, 255, 0.12), rgba(139, 44, 255, 0.09))` |
| 11043 | `rgba(19, 221, 244, 0.85)` |
| 11059 | `rgba(var(--revenue-status), 0.2)` |
| 11062 | `radial-gradient(circle at 100% 0, rgba(var(--revenue-status), 0.085), transparent 47%)` |
| 11063 | `rgba(5, 12, 25, 0.43)` |
| 11065 | `rgba(var(--revenue-status), 0.88)` |
| 11076 | `linear-gradient(90deg, transparent, rgba(var(--revenue-status), 0.76), transparent)` |
| 11096, 11152 | `rgb(var(--revenue-status))` |
| 11112 | `rgba(var(--revenue-status), 0.25)` |
| 11114 | `rgba(var(--revenue-status), 0.09)` |
| 11115 | `rgba(var(--revenue-status), 0.95)` |
| 11163 | `rgba(var(--revenue-asset-accent), 0.22)` |
| 11165 | `radial-gradient(circle at 100% 0, rgba(var(--revenue-asset-accent), 0.065), transparent 31%)` |
| 11167 | `rgba(var(--revenue-asset-accent), 0.78)` |
| 11177 | `linear-gradient(90deg, transparent, rgba(var(--revenue-asset-accent), 0.74), transparent)` |
| 11205 | `rgba(var(--revenue-asset-accent), 0.24)` |
| 11207 | `rgba(var(--revenue-asset-accent), 0.075)` |
| 11208 | `rgba(var(--revenue-asset-accent), 0.9)` |
| 11292, 11313 | `hsl(var(--muted-foreground) / 0.24)` |
| 11453 | `linear-gradient(180deg, hsl(var(--background) / .98), hsl(var(--background) / .93))` |
| 11454 | `rgb(2 12 32 / .08)` |
| 11500, 12262, 12377 | `hsl(var(--border) / .82)` |
| 11502 | `linear-gradient(145deg, hsl(var(--card) / .98), hsl(var(--muted) / .5))` |
| 11507 | `hsl(var(--foreground) / .04), 0 6px 16px rgb(7 23 55 / .08)` |
| 11513 | `hsl(var(--primary) / .48)` |
| 11514 | `hsl(var(--primary) / .08), 0 8px 18px hsl(var(--primary) / .12)` |
| 11531 | `linear-gradient(135deg, #06b6d4, #2676ff 54%, #7c3aed)` |
| 11532 | `rgb(38 118 255 / .2)` |
| 11550 | `rgb(62 140 229 / .52)` |
| 11552, 13168 | `rgb(235 242 255)` |
| 11554 | `radial-gradient(circle at 92% 0%, rgb(122 44 255 / .18), transparent 38%)` |
| 11555, 13171 | `linear-gradient(145deg, rgb(8 20 40), rgb(4 13 29))` |
| 11557 | `rgb(192 226 255 / .06)` |
| 11558 | `rgb(19 221 244 / .04)` |
| 11559 | `rgb(0 5 18 / .42)` |
| 11560 | `rgb(8 123 255 / .62)` |
| 11572 | `rgb(90 123 174 / .32)` |
| 11599, 13219 | `rgb(247 250 255)` |
| 11625, 13240 | `rgb(225 235 250)` |
| 11632 | `linear-gradient(105deg, rgb(19 221 244 / .08), rgb(8 123 255 / .1), rgb(122 44 255 / .08))` |
| 11633, 13247 | `rgb(119 219 255)` |
| 11645, 13225, 13260 | `rgb(161 181 212)` |
| 11646 | `rgb(13 28 50 / .5)` |
| 11666, 13281 | `rgb(255 130 145)` |
| 12250 | `hsl(var(--background) / .97)` |
| 12263 | `hsl(var(--background) / .98)` |
| 12264 | `rgb(2 12 32 / .045)` |
| 12378 | `hsl(var(--background) / .985)` |
| 12379 | `rgb(2 12 32 / .05)` |
| 12470 | `rgb(2 12 32 / .16)` |
| 12592 | `linear-gradient(135deg, rgb(15 111 190 / .8), rgb(78 64 210 / .72))` |
| 12594 | `rgb(35 174 255 / .12)` |
| 12610 | `hsl(var(--primary) / .42)` |
| 12632 | `rgb(38 118 255 / .14)` |
| 12670, 17341 | `hsl(var(--destructive) / .08)` |
| 12788 | `rgb(81 103 132 / 0.42)` |
| 12804 | `rgb(148 163 184 / 0.62)` |
| 12806, 15659, 15671, 15741 | `#0f172a` |
| 12834 | `rgb(8 123 255 / 0.2)` |
| 12835 | `rgb(8 123 255 / 0.34)` |
| 12850 | `rgb(164 179 201 / 0.72)` |
| 12855 | `#1687ff` |
| 12870 | `rgb(164 179 201 / 0.78)` |
| 12876 | `rgb(39 63 96 / 0.62)` |
| 13154 | `hsl(var(--primary) / 0.4)` |
| 13166 | `rgb(62 140 229 / 0.52)` |
| 13170 | `radial-gradient(circle at 92% 0%, rgb(122 44 255 / 0.18), transparent 38%)` |
| 13173 | `rgb(192 226 255 / 0.06)` |
| 13174 | `rgb(19 221 244 / 0.04)` |
| 13175 | `rgb(0 5 18 / 0.42)` |
| 13176 | `rgb(8 123 255 / 0.62)` |
| 13187 | `rgb(90 123 174 / 0.32)` |
| 13248 | `linear-gradient(105deg, rgb(19 221 244 / 0.08), rgb(8 123 255 / 0.1), rgb(122 44 255 / 0.08))` |
| 13261 | `rgb(13 28 50 / 0.5)` |
| 13296, 13816 | `hsl(var(--card) / 0.98)` |
| 13299, 13818 | `hsl(var(--border) / 0.55), 0 8px 24px rgb(2 12 32 / 0.035)` |
| 13412, 13448, 13468, 13501, 13912, 14126, 14140, 14154 | `hsl(var(--muted) / 0.4)` |
| 13439 | `rgba(0,0,0,0.1)` |
| 14163 | `hsl(var(--primary) / 0.3)` |
| 14255 | `rgba(0,0,0,0.5)` |
| 14318 | `linear-gradient(90deg, hsl(var(--primary) / 0.035), transparent 24%)` |
| 14319 | `hsl(var(--card) / 0.97)` |
| 14323 | `rgb(2 12 32 / 0.035)` |
| 14330 | `linear-gradient(90deg, rgba(19, 221, 244, 0.045), transparent 28%)` |
| 14331 | `hsl(var(--card) / 0.96)` |
| 14332 | `rgb(0 0 0 / 0.2)` |
| 14500 | `hsl(var(--primary) / 0.35)` |
| 14506 | `hsl(var(--ring))` |
| 14544 | `rgb(8 123 255 / 0.16)` |
| 14776 | `rgb(2 12 32 / 0.24)` |
| 15658 | `rgb(191 219 254 / 0.95)` |
| 15662 | `rgb(255 255 255 / 0.9)` |
| 15663, 15743 | `rgb(30 64 175 / 0.14)` |
| 15667, 15697, 15788 | `#e2e8f0` |
| 15679, 15757 | `#1e293b` |
| 15684, 15698, 15780 | `#475569` |
| 15688, 15714, 15771 | `#0369a1` |
| 15689, 15772 | `#eff6ff` |
| 15693 | `#0284c7` |
| 15699 | `#f8fafc` |
| 15703 | `#dbeafe` |
| 15704 | `#eef6ff` |
| 15717 | `rgb(59 130 246 / 0.28)` |
| 15718 | `rgb(30 64 175 / 0.1)` |
| 15722, 15727, 15797 | `#dc2626` |
| 15731 | `#b91c1c` |
| 15732 | `#fef2f2` |
| 15740 | `#bfdbfe` |
| 15943, 15998, 16037, 16079, 16088, 16109, 16135, 16148 | `#0b1739` |
| 15944, 16080, 16110 | `#eff8ff` |
| 15945, 16081, 16111 | `#b7dcff` |
| 15949, 16114 | `rgba(255, 255, 255, 0.8)` |
| 15950, 16115 | `rgba(8, 123, 255, 0.05)` |
| 15951, 16116 | `rgba(8, 63, 120, 0.05)` |
| 15999, 16136 | `#e7f5ff` |
| 16000, 16137 | `#83c8ff` |
| 16002, 16139 | `rgba(255, 255, 255, 0.9)` |
| 16003, 16093, 16140, 16163 | `rgba(8, 123, 255, 0.08)` |
| 16004, 16141 | `rgba(8, 123, 255, 0.16)` |
| 16005, 16142 | `rgba(19, 221, 244, 0.08)` |
| 16038, 16089, 16149, 16159 | `#dceeff` |
| 16039, 16090, 16150, 16160 | `#78bfff` |
| 16042, 16094, 16154, 16164 | `rgba(8, 123, 255, 0.14)` |
| 16083 | `rgba(255, 255, 255, 0.76)` |
| 16092 | `rgba(255, 255, 255, 0.82)` |
| 16152, 16162 | `rgba(255, 255, 255, 0.84)` |
| 16339 | `hsl(var(--muted) / .38)` |
| 16356 | `hsl(var(--card) / .7)` |
| 16361 | `hsl(var(--foreground) / .08)` |
| 16428 | `hsl(var(--primary) / .55)` |
| 16459, 17284 | `hsl(var(--primary) / .16)` |
| 16463 | `hsl(var(--muted) / .25)` |
| 16515, 16534 | `hsl(var(--muted) / .2)` |
| 16550 | `hsl(var(--warning) / .35)` |
| 16552 | `hsl(var(--warning) / .1)` |
| 16568 | `hsl(var(--muted) / .36)` |
| 17044 | `hsl(var(--primary) / .18)` |
| 17045 | `hsl(var(--primary) / .055), 0 2px 10px hsl(230 50% 3% / .05)` |
| 17211 | `hsl(var(--primary) / .25)` |
| 17212 | `hsl(var(--primary) / .09), 0 8px 24px rgb(0 0 0 / .16)` |
| 17267, 17418 | `hsl(var(--primary) / .06)` |
| 17285 | `linear-gradient(120deg, hsl(var(--muted) / .38), hsl(var(--card) / .9))` |
| 17286 | `hsl(var(--primary) / .38), 0 3px 12px hsl(var(--primary) / .045)` |
| 17289 | `hsl(264 82% 58% / .34)` |
| 17290 | `linear-gradient(120deg, hsl(264 82% 58% / .08), hsl(var(--card) / .94))` |
| 17291 | `hsl(264 82% 58% / .68), 0 4px 16px hsl(264 82% 58% / .08)` |
| 17314, 17334 | `hsl(var(--primary) / .09)` |
| 17319 | `hsl(264 70% 58%)` |
| 17320 | `hsl(264 82% 58% / .11)` |
| 17340 | `hsl(var(--destructive) / .4)` |
| 17363 | `hsl(var(--border) / .68)` |
| 17365 | `hsl(var(--card) / .6)` |
| 17417 | `hsl(var(--card) / .97)` |
| 17435 | `hsl(var(--muted) / .5)` |
| 17442 | `hsl(var(--primary) / .5)` |

**`artifacts/crypto-exchange-widget/src/components/admin-action-toast.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 12 | `#16a34a` |
| 21 | `#d8e5dc` |
| 23 | `#fff` |
| 24 | `#17252e` |
| 25 | `rgba(20, 33, 45, .18), 0 3px 12px rgba(20, 33, 45, .08)` |
| 31 | `#dc2626` |
| 32 | `#f2d6d6` |
| 42 | `#e9f8ed` |
| 46 | `#fef0f0` |
| 48 | `#66747a` |
| 49 | `rgba(100, 116, 139, .12)` |
| 63 | `#17232d` |
| 63 | `#344b45` |
| 63 | `#f4f8f6` |
| 64 | `#684244` |
| 65 | `#b6c4c7` |

**`artifacts/crypto-exchange-widget/src/components/community-section.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 17 | `rgb(81 133 207 / .23)` |
| 20 | `radial-gradient(ellipse at 83% 12%, rgb(103 98 222 / .10), transparent 42%)` |
| 21 | `radial-gradient(ellipse at 14% 100%, rgb(49 159 222 / .09), transparent 53%)` |
| 22 | `linear-gradient(125deg, rgb(247 250 255 / .94), rgb(238 244 254 / .92))` |
| 23 | `rgb(34 72 153 / .28), inset 0 1px 0 rgb(255 255 255 / .8)` |
| 31 | `linear-gradient(180deg, #4ed6e8, #497ff1 52%, #8d73e0)` |
| 40 | `#4269b3` |
| 53 | `#69a9ee` |
| 54 | `rgb(86 148 235 / .12)` |
| 58 | `hsl(var(--foreground))` |
| 67 | `hsl(var(--muted-foreground))` |
| 87 | `rgb(125 161 220 / .48)` |
| 89 | `#23365e` |
| 91 | `radial-gradient(circle at 29% 16%, rgb(255 255 255 / .96), transparent 47%)` |
| 92 | `linear-gradient(148deg, #f5faff 0%, #e7f0ff 54%, #dae5fc 100%)` |
| 94, 112 | `rgb(255 255 255 / .95)` |
| 95 | `rgb(77 111 187 / .13)` |
| 96 | `rgb(39 63 131 / .28)` |
| 97 | `rgb(76 114 236 / calc(var(--community-glow) * .28))` |
| 106 | `rgb(255 255 255 / .67)` |
| 113 | `rgb(77 111 187 / .1)` |
| 114 | `rgb(33 69 151 / .34)` |
| 115 | `rgb(75 119 240 / calc(.12 + var(--community-glow) * .35))` |
| 116 | `rgb(139 94 226 / calc(var(--community-glow) * .21))` |
| 124 | `hsl(var(--primary))` |
| 144, 155 | `#fff` |
| 145 | `radial-gradient(circle at 28% 105%, #ffd776 0%, #fa983c 23%, #ef375f 45%, #b92ebc 70%, #5348c7 100%)` |
| 146 | `rgb(255 255 255 / .42), 0 2px 5px rgb(119 46 135 / .18)` |
| 152 | `rgb(18 28 49 / .09)` |
| 154 | `#141414` |
| 156 | `rgb(10 18 38 / .1)` |
| 161 | `rgb(102 148 232 / .23)` |
| 163 | `radial-gradient(ellipse at 83% 12%, rgb(101 83 223 / .13), transparent 42%)` |
| 164 | `radial-gradient(ellipse at 14% 100%, rgb(31 117 199 / .10), transparent 53%)` |
| 165 | `linear-gradient(125deg, rgb(13 25 48 / .95), rgb(12 18 39 / .96))` |
| 166 | `rgb(3 8 29 / .8), inset 0 1px 0 rgb(193 218 255 / .07)` |
| 168 | `#87b9f5` |
| 170 | `rgb(124 157 228 / .48)` |
| 172 | `radial-gradient(circle at 29% 16%, rgb(255 255 255 / .26), transparent 48%)` |
| 173 | `linear-gradient(145deg, #354b78 0%, #233456 54%, #1d2746 100%)` |
| 175 | `rgb(221 236 255 / .32)` |
| 176 | `rgb(5 13 40 / .25)` |
| 177 | `rgb(2 10 32 / .65)` |
| 178 | `rgb(89 128 251 / calc(var(--community-glow) * .35))` |
| 180 | `rgb(227 239 255 / .15)` |
| 183 | `rgb(0 6 28 / .75)` |
| 184 | `rgb(94 132 253 / calc(.12 + var(--community-glow) * .42))` |
| 185 | `rgb(155 98 235 / calc(var(--community-glow) * .28))` |

**`artifacts/crypto-exchange-widget/src/components/deposit-details-modal.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 5 | `rgba(5, 9, 24, .72)` |
| 22 | `#172033` |
| 23 | `linear-gradient(155deg, #faffff, #f5f8ff 60%, #f8f5ff)` |
| 24 | `linear-gradient(120deg, rgba(19, 190, 205, .72), rgba(8, 123, 255, .6), rgba(122, 44, 255, .58))` |
| 27 | `rgba(5, 12, 42, .38), 0 0 34px rgba(8, 123, 255, .16)` |
| 33, 134, 176, 211 | `#f5f8ff` |
| 34 | `linear-gradient(155deg, #101829, #090f20 60%, #101226)` |
| 35 | `linear-gradient(120deg, rgba(19, 221, 244, .65), rgba(8, 123, 255, .62), rgba(122, 44, 255, .7))` |
| 36 | `rgba(0, 3, 15, .78), 0 0 32px rgba(36, 72, 255, .2)` |
| 40, 108 | `#087bff` |
| 62, 247, 276, 297 | `#087baf` |
| 67, 248, 279 | `#45d7ec` |
| 69 | `#647086` |
| 70, 243, 292, 303, 307 | `#a1aec6` |
| 78 | `rgba(90, 115, 160, .18)` |
| 80 | `rgba(130, 150, 190, .09)` |
| 84 | `rgba(90, 120, 190, .2)` |
| 108 | `#13ddf4` |
| 108 | `#7a2cff` |
| 109, 110 | `radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))` |
| 137, 182, 183, 216 | `#101829` |
| 178, 213, 288 | `#fff` |
| 179, 214 | `rgba(5, 12, 42, .32)` |
| 242, 244, 260, 291, 302, 306 | `#68758b` |
| 245, 261 | `#9daecc` |
| 254 | `rgba(72, 95, 150, .19)` |
| 256 | `rgba(71, 102, 180, .045)` |
| 258 | `rgba(119, 151, 207, .22)` |
| 258, 294 | `rgba(101, 131, 204, .075)` |
| 264, 299 | `#a15b0a` |
| 265, 300 | `#f5bd63` |
| 273 | `rgba(72, 95, 150, .2)` |
| 275 | `rgba(255, 255, 255, .7)` |
| 279 | `rgba(19, 31, 56, .85)` |
| 280 | `rgba(8, 123, 255, .12)` |
| 289 | `rgba(8, 40, 100, .16)` |
| 293 | `rgba(71, 102, 180, .05)` |
| 293 | `rgba(72, 95, 150, .15)` |
| 294 | `rgba(119, 151, 207, .2)` |
| 295 | `#44516b` |
| 296 | `#c4cee0` |
| 301 | `rgba(176, 119, 34, .22)` |
| 301 | `rgba(176, 119, 34, .07)` |

**`artifacts/crypto-exchange-widget/src/components/manual/manual-guides.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 1, 3, 5, 7, 16, 24, 26, 37, 42, 46, 52, 63, 77 | `hsl(var(--border))` |
| 1, 7, 12, 23, 37, 46, 52, 63, 77 | `hsl(var(--card))` |
| 4 | `radial-gradient(60% 80% at 15% 0%,rgb(6 182 212/.14),transparent),radial-gradient(60% 80% at 100% 100%,rgb(168 85 247/.14),transparent),hsl(var(--muted)/.5)` |
| 6, 12, 26, 29, 39, 52, 63 | `hsl(var(--foreground))` |
| 7 | `hsl(var(--foreground)/.25)` |
| 10, 19, 74 | `hsl(var(--muted))` |
| 11, 15, 21, 24, 30, 49, 65, 66, 74, 81 | `hsl(var(--muted-foreground))` |
| 12 | `hsl(var(--foreground)/.15)` |
| 16 | `hsl(var(--background))` |
| 17 | `hsl(var(--muted-foreground)/.25)` |
| 20 | `linear-gradient(135deg,#06b6d4,#3b82f6 55%,#a855f7)` |
| 22, 64, 73 | `#fff` |
| 22, 43, 73 | `linear-gradient(90deg,#06b6d4,#3b82f6,#a855f7)` |
| 23, 27, 33, 47, 57, 59 | `hsl(var(--primary))` |
| 23, 33 | `hsl(var(--primary-foreground))` |
| 23 | `hsl(var(--primary)/.22)` |
| 24 | `hsl(var(--background)/.9)` |
| 26 | `hsl(var(--background)/.92)` |
| 42 | `hsl(var(--muted)/.35)` |
| 47 | `hsl(var(--primary)/.5)` |
| 55 | `hsl(var(--background)/.95)` |
| 57 | `hsl(var(--primary)/.1)` |
| 60 | `radial-gradient(50% 90% at 20% 0%,rgb(6 182 212/.14),transparent),radial-gradient(50% 90% at 85% 10%,rgb(168 85 247/.12),transparent)` |
| 64 | `linear-gradient(135deg,#06b6d4,#3b82f6,#a855f7)` |
| 76 | `hsl(var(--muted-foreground)/.7)` |
| 83 | `hsl(var(--muted-foreground)/.8)` |

**`artifacts/crypto-exchange-widget/src/components/order-policy-acceptance.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 12, 27 | `hsl(var(--primary))` |
| 16 | `hsl(var(--primary) / .55)` |
| 22 | `hsl(267 72% 58%)` |

**`artifacts/crypto-exchange-widget/src/components/site-content-social.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2 | `hsl(var(--border))` |
| 3 | `hsl(var(--muted) / .34)` |
| 14 | `hsl(var(--card))` |
| 15 | `hsl(var(--primary) / .32)` |
| 25 | `linear-gradient(105deg, hsl(var(--primary) / .075), hsl(264 75% 56% / .045) 65%, transparent)` |
| 30, 67, 100, 146 | `hsl(var(--foreground))` |
| 39, 70, 85, 115, 135, 151, 156, 169, 180 | `hsl(var(--muted-foreground))` |
| 46, 107 | `hsl(var(--primary))` |
| 143, 174 | `hsl(var(--primary) / .3)` |
| 145 | `hsl(var(--primary) / .025)` |
| 153 | `hsl(var(--primary) / .55)` |
| 163 | `hsl(var(--background) / .55)` |
| 176 | `hsl(var(--primary) / .04)` |
| 182 | `hsl(var(--muted) / .65)` |

**`artifacts/crypto-exchange-widget/src/components/social-trust-footer.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 24 | `#23365e` |
| 46, 217 | `hsl(var(--primary))` |
| 97 | `#e1306c` |
| 108 | `#fff` |
| 131, 140, 160, 210 | `#008657` |
| 167, 211 | `#00b67a` |
| 185 | `hsl(var(--border))` |
| 189 | `hsl(var(--foreground))` |
| 215 | `rgb(0 182 122 / .45))` |

**`artifacts/crypto-exchange-widget/src/components/swap-followup.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 80, 99, 174, 210, 275, 374 | `hsl(var(--border))` |
| 81, 212 | `hsl(var(--card) / 0.7)` |
| 82, 117, 175, 213, 230, 246, 306 | `hsl(var(--foreground))` |
| 89 | `#fff` |
| 90 | `hsl(var(--primary) / 0.22)` |
| 102 | `radial-gradient(circle at 10% 0%, hsl(var(--primary) / 0.08), transparent 50%)` |
| 103, 229 | `hsl(var(--card))` |
| 105 | `hsl(var(--foreground) / 0.03)` |
| 124, 314 | `hsl(var(--muted-foreground))` |
| 163, 326, 337, 348, 361, 384 | `hsl(var(--primary))` |
| 225 | `hsl(var(--primary) / 0.5)` |
| 228 | `radial-gradient(circle at 0 0, hsl(var(--primary) / 0.12), transparent 45%)` |
| 231 | `rgb(0 0 0 / 0.35), 0 0 16px hsl(var(--primary) / 0.16)` |
| 277 | `hsl(var(--background) / 0.58)` |
| 288 | `hsl(var(--primary) / 0.25)` |
| 289 | `linear-gradient(120deg, hsl(var(--primary) / 0.08), hsl(var(--background) / 0.72) 60%, hsl(var(--secondary) / 0.06))` |
| 290 | `hsl(var(--foreground) / 0.04)` |
| 347 | `hsl(var(--primary) / 0.12)` |
| 358 | `hsl(var(--primary) / 0.2)` |
| 360 | `hsl(var(--primary) / 0.1)` |

**`artifacts/crypto-exchange-widget/src/flag-icon.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 13 | `hsl(var(--border) / 0.72)` |
| 15 | `hsl(var(--background) / 0.94)` |
| 16 | `hsl(var(--foreground) / 0.08)` |
| 42 | `hsl(247 78% 68% / 0.36)` |
| 43 | `hsl(225 34% 13% / 0.94)` |
| 44 | `hsl(230 70% 3% / 0.34)` |
| 50 | `hsl(var(--muted) / 0.42)` |
| 114, 133 | `hsl(var(--foreground))` |
| 124 | `hsl(var(--primary))` |
| 161 | `hsl(var(--card))` |

**`artifacts/crypto-exchange-widget/src/i18n/language-selector.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 2, 107 | `#ffffff` |
| 3, 108 | `#f6f7f9` |
| 4, 109 | `#15181e` |
| 5, 110 | `#667085` |
| 6, 111 | `#dde1e7` |
| 7, 112 | `#2563eb` |
| 8, 113 | `#eff6ff` |
| 49, 127 | `#15171c` |
| 50, 128 | `#20232a` |
| 51, 129 | `#f4f6f8` |
| 52, 130 | `#9ca3af` |
| 53, 131 | `#353942` |
| 54, 132 | `#7aa2ff` |
| 55, 133 | `#202c47` |
| 77 | `rgba(71, 196, 255, .62)` |
| 81 | `rgba(34, 211, 238, .08)` |
| 82 | `rgba(59, 130, 246, .20)` |
| 83 | `rgba(168, 85, 247, .08)` |
| 122 | `rgba(10, 15, 25, .16)` |
| 195 | `color-mix(in srgb, #5f8cff 42%, transparent)` |
| 196 | `linear-gradient(105deg, rgba(34, 211, 238, .08), rgba(59, 130, 246, .10) 52%, rgba(168, 85, 247, .08))` |
| 219, 243 | `#0d111b` |
| 220, 244 | `#151b29` |
| 221, 245 | `#f5f7fb` |
| 222, 246 | `#8f9aaf` |
| 223, 247 | `#293247` |
| 224, 248 | `#73a5ff` |
| 225, 249 | `#17233a` |
| 239 | `rgba(3, 6, 12, .54)` |
| 261 | `rgba(68, 108, 196, .16)` |

**`artifacts/crypto-exchange-widget/src/index.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 20 | `linear-gradient(to right, transparent, black 4%, black 96%, transparent)` |
| 74 | `linear-gradient(to right, transparent, black 2.5%, black 97.5%, transparent)` |
| 89 | `rgba(67, 186, 255, 0.24)` |
| 93 | `rgba(37, 99, 235, 0.05)` |
| 94 | `rgba(6, 182, 212, 0.48)` |
| 95 | `rgba(124, 58, 237, 0.4)` |
| 100 | `rgba(124, 58, 237, 0.06)` |
| 101 | `rgba(59, 130, 246, 0.44)` |
| 102 | `rgba(124, 58, 237, 0.48)` |
| 155 | `hsl(199 89% 48% / 0.24)` |
| 157 | `linear-gradient(145deg, hsl(199 89% 48% / 0.08), hsl(var(--card)))` |
| 158 | `hsl(199 89% 48% / 0.65)` |
| 173 | `hsl(145 65% 42% / .14)` |
| 174 | `hsl(145 65% 38%)` |
| 178 | `hsl(199 89% 48%)` |
| 184, 219, 228, 230, 239, 245, 310, 464, 692, 958, 1005, 1258, 1269, 1304, 1426, 1489, 1506, 1730, 1741, 1792, 1800, 1837, 1918, 1924, 1932, 1964, 1979, 2037, 2098, 2227, 3237, 3462, 3488, 3609, 3616, 3629, 3643, 3693, 3720, 3807, 3825, 3863, 3877, 3910, 3948, 4092, 4123, 4125, 4127, 4132, 4136, 4143, 4147, 4155, 4159, 4160, 4207, 4216, 4219, 4223, 4231, 4232, 4245, 4253, 4305, 4307, 4332, 4379, 4388, 4395, 4416, 4425, 4461, 4477, 4485, 4499, 4512, 4531, 4538, 4544, 4570, 4572, 4584, 5939, 6222, 6301, 6929, 6934, 7027, 7074, 7152, 7194, 7274, 7324, 7388, 8066, 8100, 9669, 10274, 10722, 10750, 10826, 10875, 11082, 11090, 11097, 11461, 11542, 11663, 11800, 11946, 11986, 12048, 12132, 12289, 12941, 12951, 13044, 13194, 13248, 14568, 15037, 15050, 16051, 16402, 16478, 16514, 16572, 16591, 16617, 16629, 18539, 20221, 20647, 20713, 20786, 20823, 20852, 20903, 20977, 21099, 21411, 22633, 22639, 22663, 22706, 22757, 22783, 22790, 22897, 23077, 23197, 24375, 24418, 24486, 24865 | `hsl(var(--muted-foreground))` |
| 206 | `linear-gradient(90deg, #06b6d4, #3b82f6, #7c3aed)` |
| 207, 1665, 2047, 2106, 2312, 19677, 19724, 20344, 20368, 20411, 20412, 20413, 20427, 20450, 20484, 20503, 20591, 20614, 20618, 21114, 23089, 23649 | `#ffffff` |
| 209 | `rgba(6, 182, 212, 0.4)` |
| 211, 220, 240, 241, 245, 453, 909, 1001, 1186, 1211, 1560, 1582, 1764, 1836, 2903, 3480, 3570, 3578, 3586, 3603, 3607, 3608, 3612, 3621, 3625, 3654, 3656, 3773, 3784, 3847, 3901, 3912, 3945, 4037, 4079, 4120, 4129, 4150, 4176, 4203, 4212, 4222, 4242, 4252, 4253, 4263, 4300, 4302, 4325, 4357, 4404, 4411, 4430, 4439, 4476, 4534, 4548, 4582, 4584, 5809, 5854, 5940, 6270, 6521, 6943, 7045, 7125, 7172, 7220, 7318, 7337, 7349, 7363, 7384, 7857, 9654, 9851, 10656, 11080, 11899, 12820, 12850, 12866, 12887, 13239, 14413, 14651, 14672, 14735, 14756, 15004, 16499, 16561, 16580, 16817, 18444, 20131, 20710, 21054, 21265, 21280, 22492, 22675, 22809, 22854, 22864, 22884, 23231, 24006, 24007, 24014, 24345, 24380, 24707 | `hsl(var(--border))` |
| 211, 220, 281, 456, 921, 1130, 1185, 1208, 1540, 3569, 3607, 3731, 3775, 3849, 4098, 4129, 4177, 4204, 4205, 4264, 4279, 4302, 4348, 4410, 4429, 5856, 5942, 6272, 6325, 6419, 7044, 7124, 7171, 7219, 8027, 8039, 9686, 10560, 10591, 10611, 10654, 10731, 11444, 11528, 11604, 11907, 12074, 12115, 12822, 12889, 13241, 14414, 14704, 14711, 14758, 15013, 15531, 15545, 15720, 16026, 16185, 16410, 16819, 20130, 20693, 21013, 21252, 22491, 22998, 23222, 24004, 24557 | `hsl(var(--card))` |
| 211, 212, 213, 226, 231, 240, 242, 246, 302, 339, 422, 452, 560, 949, 1275, 1312, 1475, 1543, 1624, 1635, 1647, 1723, 1750, 1781, 1812, 1945, 1976, 2043, 2101, 2132, 2235, 2672, 3223, 3473, 3504, 3615, 3701, 3728, 3732, 3832, 4097, 4126, 4224, 4254, 4373, 4401, 4504, 4546, 4586, 5857, 6294, 6322, 7190, 7312, 7333, 7338, 7375, 7421, 8077, 8113, 8164, 9681, 9691, 10258, 10578, 10732, 10843, 11070, 11268, 11282, 11475, 11547, 11674, 11744, 11754, 11940, 12052, 12097, 12139, 12508, 12837, 12853, 12869, 12910, 12931, 13036, 13206, 14415, 14478, 14652, 14660, 14673, 15012, 15456, 16055, 16399, 16473, 16523, 16585, 16624, 18543, 19843, 20143, 20165, 20211, 20768, 20837, 20858, 20896, 20960, 21014, 22453, 22464, 22474, 22625, 22688, 22711, 22778, 22853, 22869, 22890, 22903, 23239, 23981, 24016, 24042, 24393, 24816, 24878 | `hsl(var(--foreground))` |
| 212 | `hsl(153 55% 40% / .28)` |
| 212 | `hsl(153 55% 40% / .08)` |
| 213 | `hsl(153 55% 40% / .16)` |
| 213 | `hsl(153 55% 40% / .55)` |
| 214, 218 | `#00b67a` |
| 214, 6493, 6544, 7313, 7317, 7339, 7348, 7362, 7383, 9644, 9957, 12411, 12427, 12500, 12518, 12542, 12551, 12591, 12881, 12965, 13495, 13507, 13515, 14638, 17088, 17141, 17161, 17178, 17247, 17261, 17300, 17357, 17424, 17471, 17478, 17546, 19580, 19604, 19610, 19641, 21080, 21894, 21901, 22100, 22219, 24751 | `#fff` |
| 220, 22104, 22239 | `rgba(0,0,0,0.1)` |
| 221 | `linear-gradient(120deg, #070b16, #0b1831 58%, #17103a)` |
| 221 | `#0898e8` |
| 225 | `#10b981` |
| 225, 22175, 22250 | `rgba(16, 185, 129, 0.1)` |
| 225 | `rgba(16, 185, 129, 0.2)` |
| 233 | `linear-gradient(135deg, hsl(var(--muted) / .5), hsl(var(--card)))` |
| 233 | `hsl(var(--primary) / .2)` |
| 234 | `hsl(var(--primary) / .22)` |
| 238 | `hsl(var(--primary) / .25)` |
| 238, 315, 356, 399, 414, 459, 590, 920, 970, 1233, 1317, 1516, 1796, 1909, 1970, 2659, 3617, 3630, 3706, 4101, 4111, 4119, 4122, 4130, 4137, 4145, 4152, 4156, 4213, 4302, 4445, 4518, 5920, 7005, 7065, 7114, 7142, 9685, 10346, 10613, 10836, 10857, 11102, 11108, 11505, 11520, 11771, 11783, 11908, 11924, 12014, 13003, 13229, 13453, 15808, 16009, 16389, 16601, 16673, 16714, 16796, 20722, 20813, 20885, 20918, 22599, 22652, 22772, 22799, 22875, 23214, 24077, 24352, 24361, 24403, 24832, 24841, 24873 | `hsl(var(--primary))` |
| 238, 412, 451, 3911, 4212, 4475, 7101, 7109, 7422, 10349, 10616, 10628, 10635, 10643, 10858, 11707, 11781, 12852, 12868, 15500, 16343, 16505, 16571, 23982 | `hsl(var(--background))` |
| 241 | `hsl(var(--muted) / .15)` |
| 244 | `#059669` |
| 276, 972, 20883, 24898 | `hsl(var(--primary) / 0.22)` |
| 279 | `radial-gradient(circle at 8% 0%, hsl(var(--primary) / 0.18), transparent 42%)` |
| 280 | `radial-gradient(circle at 96% 100%, hsl(270 90% 62% / 0.14), transparent 40%)` |
| 282 | `hsl(var(--primary) / 0.85)` |
| 284, 457 | `hsl(var(--card-foreground))` |
| 294 | `linear-gradient(hsl(var(--primary) / 0.045) 1px, transparent 1px)` |
| 295 | `linear-gradient(90deg, hsl(var(--primary) / 0.045) 1px, transparent 1px)` |
| 297 | `linear-gradient(to bottom right, black, transparent 72%)` |
| 335 | `hsl(var(--border) / 0.85)` |
| 337 | `hsl(var(--background) / 0.74)` |
| 340 | `hsl(0 0% 100% / 0.04)` |
| 352 | `hsl(var(--primary) / 0.28)` |
| 354, 13002, 13228, 15998, 16206, 20917 | `hsl(var(--primary) / 0.09)` |
| 370 | `linear-gradient(110deg, hsl(var(--primary)), hsl(258 88% 61%))` |
| 377, 926 | `hsl(var(--primary) / 0.75)` |
| 383 | `hsl(var(--primary) / 0.9)` |
| 389 | `hsl(var(--primary) / 0.36)` |
| 390 | `linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--background) / 0.82))` |
| 415 | `hsl(var(--primary) / 0.18), 0 0 18px hsl(var(--primary) / 0.7)` |
| 454, 1223, 1646, 1763, 9656 | `hsl(var(--input))` |
| 455, 4104, 9696, 11113 | `hsl(var(--ring))` |
| 458, 4349, 14709 | `hsl(var(--card-border))` |
| 460, 1845, 3705, 4137, 7119, 8118, 11784, 13597 | `hsl(var(--primary-foreground))` |
| 461 | `hsl(var(--secondary))` |
| 462 | `hsl(var(--secondary-foreground))` |
| 463, 1276, 1311, 1488, 1749, 1813, 1880, 1933, 1963, 3474, 3687, 4091, 4144, 4386, 4505, 4547, 6522, 7343, 7354, 7379, 12940, 18542, 20663, 20976, 22662, 24017 | `hsl(var(--muted))` |
| 465, 3613, 4139, 4146, 4164, 4362, 4491 | `hsl(var(--accent))` |
| 466, 3613, 4164, 4363, 4491, 11512 | `hsl(var(--accent-foreground))` |
| 467, 3814, 4089, 4108, 4117, 4220, 13050, 16045, 16047, 16059 | `hsl(var(--destructive))` |
| 468 | `hsl(var(--destructive-foreground))` |
| 469, 3539 | `hsl(var(--sidebar))` |
| 470, 3541 | `hsl(var(--sidebar-foreground))` |
| 471, 3539, 4972 | `hsl(var(--sidebar-border))` |
| 472, 3542, 3543, 14270 | `hsl(var(--sidebar-primary))` |
| 473 | `hsl(var(--sidebar-primary-foreground))` |
| 474, 3541 | `hsl(var(--sidebar-accent))` |
| 475 | `hsl(var(--sidebar-accent-foreground))` |
| 477, 3811, 4114, 15812, 16688 | `hsl(var(--success))` |
| 478, 606, 650 | `hsl(0 0% 100%)` |
| 479, 3813, 4115 | `hsl(var(--warning))` |
| 480 | `hsl(var(--warning-foreground))` |
| 481, 4116, 15816 | `hsl(var(--info))` |
| 496, 497 | `rgb(0 0 0 / 0.05)` |
| 498 | `rgb(0 0 0 / 0.08)` |
| 499 | `rgb(0 0 0 / 0.12)` |
| 500, 12116 | `rgb(0 0 0 / 0.16)` |
| 511 | `radial-gradient(circle at 12% 8%, rgb(34 211 238 / 10%), transparent 34%)` |
| 512 | `radial-gradient(circle at 84% 82%, rgb(124 58 237 / 10%), transparent 36%)` |
| 513 | `linear-gradient(145deg, rgb(244 249 255 / 98%), rgb(246 244 255 / 96%))` |
| 514 | `rgb(99 102 241 / 24%)` |
| 516 | `rgb(255 255 255 / 82%)` |
| 517 | `rgb(79 70 229 / 38%)` |
| 523 | `radial-gradient(circle at 12% 8%, rgb(34 211 238 / 7%), transparent 34%)` |
| 524 | `radial-gradient(circle at 84% 82%, rgb(124 58 237 / 12%), transparent 38%)` |
| 525 | `linear-gradient(145deg, rgb(8 15 34 / 99%), rgb(10 9 27 / 99%))` |
| 526 | `rgb(96 165 250 / 22%)` |
| 528, 23366 | `rgb(103 232 249 / 7%)` |
| 529 | `rgb(37 99 235 / 38%)` |
| 546 | `radial-gradient(ellipse at center, hsl(190 90% 60% / 0.15), hsl(250 90% 65% / 0.15), transparent 70%)` |
| 551 | `radial-gradient(ellipse at center, hsl(190 90% 60% / 0.25), hsl(250 90% 65% / 0.25), transparent 70%)` |
| 604 | `linear-gradient(145deg, hsl(196 92% 52% / 0.2), hsl(268 88% 62% / 0.24))` |
| 605 | `hsl(222 40% 14%)` |
| 607 | `hsl(218 92% 68% / 0.38)` |
| 609, 14659 | `hsl(var(--primary) / 0.42)` |
| 610, 616 | `hsl(268 88% 62% / 0.28)` |
| 615 | `hsl(var(--primary) / 0.42))` |
| 648 | `linear-gradient(145deg, hsl(190 94% 54% / 0.34), hsl(270 90% 64% / 0.4))` |
| 649 | `hsl(222 40% 12%)` |
| 651 | `hsl(var(--primary) / 0.62)` |
| 653, 3856, 7052, 10595, 10800, 11454, 11572, 20160, 24853 | `hsl(var(--primary) / 0.3)` |
| 654 | `hsl(268 88% 62% / 0.22)` |
| 660 | `linear-gradient(90deg, transparent, hsl(var(--border) / 0.5), transparent)` |
| 670, 16199 | `hsl(var(--border) / 0.3)` |
| 682 | `hsl(var(--primary) / 0.7)` |
| 708 | `hsl(var(--foreground) / 0.78)` |
| 714, 11120, 11705, 12977, 23009, 24318 | `hsl(var(--border) / 0.7)` |
| 715 | `hsl(var(--background) / 0.48)` |
| 911, 10768, 11437, 11623 | `hsl(var(--muted) / 0.4)` |
| 922, 1425, 5919, 7053, 12900, 12901, 20812 | `hsl(var(--primary) / 0.08)` |
| 930 | `hsl(var(--muted-foreground) / 0.35)` |
| 971, 1883, 4444, 7060, 7138, 7179, 7203, 8060, 11923, 12170, 24837 | `hsl(var(--primary) / 0.1)` |
| 1111, 1117 | `rgba(6, 182, 212, 0)` |
| 1112 | `rgba(139, 92, 246, 0.25), 0 0 65px 25px rgba(6, 182, 212, 0.15)` |
| 1113 | `rgba(59, 130, 246, 0.12), 0 12px 40px -12px rgba(139, 92, 246, 0.12)` |
| 1118 | `rgba(139, 92, 246, 0.35), 0 0 65px 25px rgba(6, 182, 212, 0.25)` |
| 1119 | `rgba(59, 130, 246, 0.18), 0 12px 40px -12px rgba(139, 92, 246, 0.18)` |
| 1140 | `linear-gradient(120deg, rgba(6, 182, 212, 0.5), rgba(59, 130, 246, 0.5), rgba(139, 92, 246, 0.5), rgba(6, 182, 212, 0.5))` |
| 1157 | `linear-gradient(120deg, rgba(6, 182, 212, 0.7), rgba(59, 130, 246, 0.7), rgba(139, 92, 246, 0.7), rgba(6, 182, 212, 0.7))` |
| 1174 | `rgba(59, 130, 246, 0.14)` |
| 1187 | `rgba(0,0,0,0.15)` |
| 1196 | `rgba(0,0,0,0.5)` |
| 1197, 22700 | `hsl(var(--border)/0.5)` |
| 1234, 1316, 22598 | `hsl(var(--primary)/0.1)` |
| 1303, 1354, 22696 | `hsl(var(--muted)/0.5)` |
| 1318, 4854, 4918 | `hsl(var(--primary)/0.2)` |
| 1358 | `hsl(var(--primary)/0.05)` |
| 1385 | `hsl(var(--border)), 0 2px 8px rgb(15 23 42 / 0.08)` |
| 1523 | `rgba(0, 0, 0, 0.4)` |
| 1562 | `rgba(0, 0, 0, 0.22)` |
| 1566, 18161 | `rgba(116, 145, 197, 0.2)` |
| 1567, 22510 | `rgba(0, 0, 0, 0.72)` |
| 1583 | `rgba(15, 23, 42, 0.18)` |
| 1587, 6912, 10531, 23028 | `rgba(255, 255, 255, 0.08)` |
| 1588, 10530 | `rgba(0, 0, 0, 0.5)` |
| 1603 | `rgb(37 140 255 / 28%)` |
| 1606 | `radial-gradient(circle at 12% 0%, rgb(19 221 244 / 8%), transparent 42%)` |
| 1607 | `radial-gradient(circle at 90% 100%, rgb(122 44 255 / 8%), transparent 44%)` |
| 1608 | `hsl(var(--card) / 96%)` |
| 1610 | `rgb(37 140 255 / 7%)` |
| 1611 | `rgb(122 44 255 / 6%)` |
| 1612 | `rgb(37 140 255 / 15%)` |
| 1613, 1700 | `rgb(122 44 255 / 10%)` |
| 1626, 1699 | `rgb(37 140 255 / 12%)` |
| 1627, 1689 | `rgb(122 44 255 / 9%)` |
| 1639 | `rgb(37 140 255 / 18%)` |
| 1643 | `rgb(37 140 255 / 42%)` |
| 1645 | `linear-gradient(135deg, rgb(19 221 244 / 4%), rgb(122 44 255 / 4%))` |
| 1649 | `rgb(19 221 244 / 6%)` |
| 1650 | `rgb(122 44 255 / 5%)` |
| 1651 | `rgb(37 140 255 / 10%)` |
| 1655 | `rgb(19 221 244 / 78%)` |
| 1657 | `rgb(19 221 244 / 12%)` |
| 1658 | `rgb(37 140 255 / 9%)` |
| 1659 | `rgb(122 44 255 / 15%)` |
| 1663 | `rgb(255 255 255 / 18%)` |
| 1664 | `linear-gradient(105deg, #13ddf4 0%, #258cff 50%, #7a2cff 100%)` |
| 1667 | `rgb(255 255 255 / 28%)` |
| 1668 | `rgb(76 29 149 / 14%)` |
| 1669 | `rgb(37 140 255 / 25%)` |
| 1670 | `rgb(122 44 255 / 17%)` |
| 1674 | `linear-gradient(105deg, #29e4f7 0%, #358fff 48%, #873cff 100%)` |
| 1676 | `rgb(255 255 255 / 32%)` |
| 1677 | `rgb(76 29 149 / 16%)` |
| 1678 | `rgb(37 140 255 / 31%)` |
| 1679 | `rgb(122 44 255 / 22%)` |
| 1684, 12403, 12474 | `#7a2cff` |
| 1688 | `rgb(122 44 255 / 26%)` |
| 1693 | `rgb(19 221 244 / 34%)` |
| 1695 | `radial-gradient(circle at 12% 0%, rgb(19 221 244 / 10%), transparent 42%)` |
| 1696 | `radial-gradient(circle at 90% 100%, rgb(122 44 255 / 12%), transparent 46%)` |
| 1697 | `rgb(7 13 29 / 96%)` |
| 1701 | `rgb(0 0 0 / 48%)` |
| 1702 | `rgb(37 140 255 / 16%)` |
| 1703 | `rgb(122 44 255 / 14%)` |
| 1740, 1835, 1955, 8160, 10709, 12288 | `hsl(var(--muted) / 0.5)` |
| 1773, 20155 | `hsl(var(--primary) / 0.5)` |
| 1774, 10596, 11682, 12032 | `hsl(var(--primary) / 0.05)` |
| 1969 | `hsl(var(--primary) / 0.15)` |
| 1991 | `rgba(22, 139, 255, 0.3)` |
| 2001 | `rgba(0, 0, 0, 0.72), 0 0 28px -22px rgba(22, 139, 255, 0.5)` |
| 2002, 6619, 6620, 10559 | `rgba(255, 255, 255, 0.05)` |
| 2006 | `linear-gradient(hsl(var(--widget-bg)), hsl(var(--widget-bg)))` |
| 2007, 2046 | `linear-gradient(135deg, #13DDF4, #087BFF, #2448FF, #7A2CFF)` |
| 2009 | `rgba(8, 123, 255, 0.15), var(--widget-shadow)` |
| 2015 | `linear-gradient(180deg, hsl(var(--widget-bg)), hsl(var(--widget-input-bg)))` |
| 2016, 2140, 2168, 2189, 2200, 2264 | `hsl(var(--widget-border))` |
| 2021, 2079, 2149, 2205, 2225, 2250, 2292 | `hsl(var(--widget-input-bg))` |
| 2022, 2080, 2113, 2206, 2226, 2293 | `hsl(var(--widget-input-border))` |
| 2023, 2081, 2207, 2294, 4352, 22238 | `rgba(0,0,0,0.03)` |
| 2030, 2121, 10547, 22133 | `rgba(0,0,0,0.2)` |
| 2048 | `rgba(8, 123, 255, 0.3)` |
| 2053, 2125, 2139, 2167, 2188, 2212, 2233, 2271, 2303 | `hsl(var(--widget-bg))` |
| 2054, 2060, 2075, 2154, 2159, 2170, 2217, 2239, 2254, 2258, 2283, 2304 | `hsl(var(--widget-primary))` |
| 2055, 2169 | `rgba(0,0,0,0.08), var(--widget-inset-highlight)` |
| 2056, 2160, 2305 | `hsl(var(--widget-primary) / 0.15)` |
| 2061, 2158 | `hsl(var(--widget-primary) / 0.1)` |
| 2062, 2285 | `hsl(var(--widget-primary) / 0.2)` |
| 2102 | `hsl(var(--widget-bg) / 0.5)` |
| 2105 | `linear-gradient(112deg, #13ddf4 0%, #087bff 45%, #7a2cff 100%)` |
| 2107 | `rgb(80 146 255 / 0.46)` |
| 2108 | `rgb(36 72 255 / 0.7), var(--widget-inset-highlight)` |
| 2112, 2263 | `linear-gradient(180deg, hsl(var(--widget-input-bg)), hsl(var(--widget-bg)))` |
| 2115, 2228, 4433, 7049, 7129, 10542, 10592 | `rgba(0,0,0,0.02)` |
| 2124, 2213 | `hsl(var(--widget-primary) / 0.5)` |
| 2126 | `hsl(var(--widget-primary) / 0.15), inset 0 2px 4px rgba(0,0,0,0.01)` |
| 2135, 16027 | `hsl(var(--muted-foreground) / 0.5)` |
| 2141 | `rgba(0,0,0,0.05), var(--widget-inset-highlight)` |
| 2150, 2177, 2272 | `hsl(var(--widget-primary) / 0.4)` |
| 2153 | `hsl(var(--widget-bg)), 0 0 0 4px hsl(var(--widget-primary) / 0.3)` |
| 2178, 2273 | `hsl(var(--widget-primary) / 0.15), var(--widget-inset-highlight)` |
| 2182 | `hsl(var(--widget-primary) / 0.2), var(--widget-inset-highlight)` |
| 2190 | `rgba(0,0,0,0.15), var(--widget-inset-highlight)` |
| 2194 | `hsl(var(--widget-bg) / 0.95)` |
| 2195 | `rgba(0,0,0,0.6), var(--widget-inset-highlight)` |
| 2214 | `hsl(var(--widget-primary) / 0.15), inset 0 1px 2px rgba(0,0,0,0.01)` |
| 2234, 2240 | `hsl(var(--widget-primary) / 0.3)` |
| 2238 | `linear-gradient(180deg, hsl(var(--widget-primary) / 0.12), hsl(var(--widget-primary) / 0.05))` |
| 2241 | `hsl(var(--widget-primary) / 0.1), var(--widget-inset-highlight)` |
| 2253 | `linear-gradient(90deg, hsl(var(--widget-primary) / 0.1), transparent)` |
| 2266 | `rgba(0,0,0,0.01)` |
| 2276 | `hsl(var(--widget-primary)), inset 0 2px 4px rgba(0,0,0,0.01)` |
| 2279 | `hsl(var(--widget-primary)), 0 6px 24px -6px hsl(var(--widget-primary) / 0.15), var(--widget-inset-highlight)` |
| 2284 | `linear-gradient(135deg, hsl(var(--widget-primary) / 0.15), hsl(var(--widget-primary) / 0.05))` |
| 2286 | `rgba(255,255,255,0.2)` |
| 2310 | `linear-gradient(180deg, hsl(var(--widget-primary)), hsl(var(--widget-primary-hover)))` |
| 2311 | `hsl(var(--widget-primary-hover))` |
| 2313, 2325 | `hsl(var(--widget-primary) / 0.4), inset 0 1px 0 rgba(255,255,255,0.2)` |
| 2324 | `linear-gradient(180deg, hsl(var(--widget-primary) / 0.9), hsl(var(--widget-primary-hover)))` |
| 2330, 17423 | `linear-gradient(105deg, #16dbe9 0%, #118bff 50%, #bd1eff 100%)` |
| 2331 | `rgb(80 146 255 / 0.34)` |
| 2332 | `rgb(255 255 255 / 0.7)` |
| 2352 | `linear-gradient(135deg, hsl(var(--destructive) / 0.08), hsl(var(--destructive) / 0.02))` |
| 2353 | `hsl(var(--destructive) / 0.2)` |
| 2354, 10629, 10644, 22233 | `rgba(255,255,255,0.05)` |
| 2457 | `rgba(25, 68, 128, 0.28)` |
| 2458 | `linear-gradient(112deg, #13DDF4 0%, #087BFF 34%, #2448FF 68%, #7A2CFF 100%)` |
| 2459 | `linear-gradient(112deg, #24E5FA 0%, #1986FF 34%, #3556FF 68%, #8B40FF 100%)` |
| 2460 | `rgba(8, 123, 255, 0.64)` |
| 2501 | `rgba(0, 0, 0, 0.75)` |
| 2907 | `hsl(var(--sidebar-foreground) / 0.1)` |
| 3199, 3200 | `#071426` |
| 3201 | `rgb(2 10 23 / 0.32), 0 0 7px rgb(39 125 255 / 0.12)` |
| 3347 | `linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--card)) 50%, hsl(var(--muted)) 75%)` |
| 3353 | `linear-gradient(hsl(var(--border) / .3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / .3) 1px, transparent 1px)` |
| 3359 | `hsl(var(--muted-foreground)/0.3)` |
| 3539 | `hsl(222 47% 4% / .32)` |
| 3540 | `hsl(var(--sidebar-foreground) / .68)` |
| 3561 | `hsl(222 47% 8% / .54)` |
| 3570 | `hsl(var(--foreground)/0.1)` |
| 3587, 4438, 10546, 11600, 11901, 16498, 16560 | `hsl(var(--muted) / 0.3)` |
| 3603 | `hsl(var(--muted) / 0.1)` |
| 3608 | `hsl(var(--primary) / .06)` |
| 3617 | `hsl(var(--primary) / .12)` |
| 3702 | `hsl(var(--background) / .65)` |
| 3707 | `hsl(var(--primary) / .26)` |
| 3713 | `hsl(var(--muted) / .5)` |
| 3850 | `hsl(var(--foreground) / 0.03)` |
| 3855, 7635, 11708 | `hsl(var(--foreground) / 0.06)` |
| 3949 | `hsl(var(--muted) / .34)` |
| 4088, 4218 | `#4caf50` |
| 4088 | `hsl(120 100% 25% / .14)` |
| 4099 | `hsl(var(--ring) / .72), 0 2px 7px hsl(var(--foreground) / .08)` |
| 4106 | `hsl(var(--ring) / .16)` |
| 4111, 4130, 4152, 24019 | `hsl(var(--primary) / .1)` |
| 4114 | `hsl(var(--success)/.1)` |
| 4114 | `hsl(var(--success)/.2)` |
| 4115 | `hsl(var(--warning)/.1)` |
| 4115 | `hsl(var(--warning)/.2)` |
| 4116 | `hsl(var(--info)/.1)` |
| 4116 | `hsl(var(--info)/.2)` |
| 4117 | `hsl(var(--destructive) / .1)` |
| 4120, 22904 | `hsl(var(--primary) / .07)` |
| 4128 | `hsl(220 30% 15% / .42)` |
| 4129 | `hsl(220 30% 15% / .24)` |
| 4138 | `hsl(var(--primary-foreground) / .68)` |
| 4140 | `hsl(var(--primary-foreground) / .63)` |
| 4244 | `hsl(var(--muted) / .25)` |
| 4281 | `rgb(113 215 194 / .55)` |
| 4281 | `rgb(113 215 194 / .14)` |
| 4281 | `#b8f0df` |
| 4283 | `#b7c9cc` |
| 4285, 4288, 4289, 4290 | `#71d7c2` |
| 4286, 4291, 4292 | `#ffb8b4` |
| 4287 | `#f4f8f2` |
| 4289 | `#133a52` |
| 4292 | `#ff8f88` |
| 4519 | `hsl(var(--primary) / .09)` |
| 4520 | `hsl(var(--primary) / .16)` |
| 4536 | `hsl(145 62% 35%)` |
| 4537 | `hsl(145 55% 38% / .55)` |
| 4740 | `hsl(var(--foreground)/0.1)] dark:hover:shadow-[4px_4px_0px_0px_hsl(var(--primary)/0.3)` |
| 4750 | `hsl(220 64% 4% / 0.7)` |
| 5009 | `hsl(var(--sidebar-foreground)/0.1)` |
| 5812 | `hsl(224 40% 8% / 0.08)` |
| 5813, 6009 | `hsl(224 40% 8% / 0.05)` |
| 5864 | `rgb(181 188 211 / 0.78)` |
| 5875, 5901, 5961 | `#1766e9` |
| 5876, 5902, 5962 | `linear-gradient(135deg, #176fe9 0%, #343ad8 100%)` |
| 5877, 5903, 5963 | `#d9fbff` |
| 5879, 5965 | `rgb(23 67 190 / 0.22)` |
| 5880, 5906, 5966 | `#22d7ed` |
| 5885, 5971 | `#2822aa` |
| 5886, 5972 | `linear-gradient(135deg, #164dbf 0%, #3022a9 100%)` |
| 5887, 5973 | `#c6f8ff` |
| 5889 | `rgb(24 37 128 / 0.24)` |
| 5890, 5974 | `#17bcd7` |
| 5896 | `#16dff4` |
| 5905 | `rgb(23 67 190 / 0.2)` |
| 5918 | `hsl(var(--primary) / 0.55)` |
| 5946 | `rgb(36 91 222 / 0.42)` |
| 5947 | `linear-gradient(135deg, #e5f9fb 0%, #e4e9fb 100%)` |
| 5948 | `#173c99` |
| 5950 | `rgb(18 56 143 / 0.08)` |
| 5951 | `#18c9e6` |
| 6008 | `hsl(224 40% 8% / 0.09)` |
| 6085 | `radial-gradient(ellipse at 8% 48%, rgb(124 58 237 / 12%), transparent 34%)` |
| 6086 | `radial-gradient(ellipse at 92% 70%, rgb(37 99 235 / 10%), transparent 36%)` |
| 6087 | `linear-gradient(180deg, rgb(250 247 255 / 96%), rgb(244 248 255 / 98%))` |
| 6092 | `radial-gradient(ellipse at 8% 48%, rgb(124 58 237 / 16%), transparent 34%)` |
| 6093 | `radial-gradient(ellipse at 92% 70%, rgb(14 165 233 / 12%), transparent 36%)` |
| 6094 | `linear-gradient(180deg, rgb(10 7 24 / 98%), rgb(5 12 27 / 99%))` |
| 6113, 23343, 23354 | `radial-gradient(ellipse at 14% 20%, rgb(34 211 238 / 20%), transparent 36%)` |
| 6114, 23344, 23355 | `radial-gradient(ellipse at 84% 42%, rgb(59 130 246 / 20%), transparent 38%)` |
| 6115 | `radial-gradient(ellipse at 54% 92%, rgb(139 92 246 / 14%), transparent 42%)` |
| 6116, 23345, 23356 | `linear-gradient(145deg, rgb(235 251 255 / 97%), rgb(235 240 255 / 97%) 54%, rgb(244 236 255 / 97%))` |
| 6117 | `rgb(37 99 235 / 65%)` |
| 6122, 23361, 23372 | `radial-gradient(ellipse at 14% 20%, rgb(34 211 238 / 17%), transparent 36%)` |
| 6123, 23362, 23373 | `radial-gradient(ellipse at 84% 42%, rgb(59 130 246 / 18%), transparent 38%)` |
| 6124 | `radial-gradient(ellipse at 54% 92%, rgb(139 92 246 / 16%), transparent 42%)` |
| 6125, 23363, 23374 | `linear-gradient(145deg, rgb(6 23 40 / 98%), rgb(10 18 45 / 98%) 54%, rgb(25 13 48 / 98%))` |
| 6154 | `rgb(150 160 190 / 0.72)` |
| 6163, 6202, 6254, 6283, 6986, 7492 | `#007bff` |
| 6167 | `linear-gradient(90deg, #007bff, #8a2be2)` |
| 6203 | `rgba(0, 123, 255, 0.1)` |
| 6247 | `rgb(255 255 255 / 0.86)` |
| 6273 | `hsl(224 40% 8% / 0.06)` |
| 6284 | `rgb(0 123 255 / 0.1)` |
| 6324 | `linear-gradient(135deg, rgb(255 255 255 / 0.82), rgb(241 248 255 / 0.7))` |
| 6326 | `rgb(70 154 255 / 0.24)` |
| 6329 | `rgb(0 123 255 / 0.09)` |
| 6330 | `rgb(255 255 255 / 0.85)` |
| 6341 | `linear-gradient(90deg, transparent, rgb(255 255 255 / 0.52), transparent)` |
| 6371 | `#087cf0` |
| 6373, 6392, 6401, 6410 | `radial-gradient(circle at 30% 22%, rgb(255 255 255 / 0.98), transparent 34%)` |
| 6374 | `linear-gradient(145deg, #e8f6ff, #c7e5ff)` |
| 6375 | `rgb(65 160 255 / 0.28)` |
| 6378, 7484 | `rgb(0 123 255 / 0.2)` |
| 6379 | `rgb(255 255 255 / 0.95)` |
| 6380, 6423, 7488 | `rgb(0 123 255 / 0.08)` |
| 6386 | `rgb(0 123 255 / 0.28))` |
| 6390 | `#6f3cff` |
| 6393 | `linear-gradient(145deg, #f0ebff, #d9ceff)` |
| 6394 | `rgb(118 76 255 / 0.25)` |
| 6395 | `rgb(111 60 255 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.95)` |
| 6399 | `#008d9d` |
| 6402 | `linear-gradient(145deg, #e2fbff, #bcecf2)` |
| 6403 | `rgb(0 163 181 / 0.24)` |
| 6404 | `rgb(0 154 171 / 0.17), inset 0 1px 0 rgb(255 255 255 / 0.95)` |
| 6408 | `#415ee8` |
| 6411 | `linear-gradient(145deg, #edf1ff, #ced7ff)` |
| 6412 | `rgb(65 94 232 / 0.23)` |
| 6413 | `rgb(65 94 232 / 0.17), inset 0 1px 0 rgb(255 255 255 / 0.95)` |
| 6418 | `linear-gradient(135deg, rgb(18 28 50 / 0.96), rgb(10 16 32 / 0.92))` |
| 6420 | `rgb(93 169 255 / 0.2)` |
| 6422 | `rgb(0 0 0 / 0.28)` |
| 6424, 11619, 16420 | `rgb(255 255 255 / 0.08)` |
| 6461 | `linear-gradient(#fff, #fff)` |
| 6462 | `linear-gradient(145deg, rgb(255 255 255 / 0.98), rgb(41 137 255 / 0.58) 48%, rgb(126 82 255 / 0.34))` |
| 6464 | `rgb(25 68 128 / 0.13)` |
| 6465, 10050, 24133 | `rgb(255 255 255 / 0.92)` |
| 6470 | `linear-gradient(#0b0d1a, #0b0d1a)` |
| 6471 | `linear-gradient(145deg, rgb(255 255 255 / 0.18), rgb(36 134 255 / 0.72) 50%, rgb(131 75 255 / 0.48))` |
| 6473, 11617 | `rgb(0 0 0 / 0.42)` |
| 6474 | `rgb(21 112 255 / 0.09)` |
| 6475, 16450 | `rgb(255 255 255 / 0.07)` |
| 6491, 12594 | `rgb(255 255 255 / 0.38)` |
| 6495 | `linear-gradient(180deg, rgb(255 255 255 / 0.3) 0, rgb(255 255 255 / 0.08) 34%, transparent 35%)` |
| 6496 | `linear-gradient(112deg, #168cff 0%, #086ee8 46%, #6657f5 100%)` |
| 6498 | `rgb(13 111 232 / 0.28)` |
| 6499 | `rgb(255 255 255 / 0.54)` |
| 6500 | `rgb(0 45 122 / 0.22)` |
| 6504 | `rgb(255 255 255 / 0.56)` |
| 6506 | `linear-gradient(180deg, rgb(255 255 255 / 0.38) 0, rgb(255 255 255 / 0.1) 34%, transparent 35%)` |
| 6507 | `linear-gradient(112deg, #2999ff 0%, #0878f4 46%, #7564ff 100%)` |
| 6509 | `rgb(13 111 232 / 0.34)` |
| 6510 | `rgb(60 125 255 / 0.16)` |
| 6511 | `rgb(255 255 255 / 0.64)` |
| 6516 | `rgb(13 111 232 / 0.24)` |
| 6517 | `rgb(0 47 128 / 0.2)` |
| 6529 | `rgb(15 23 42 / 0.08)` |
| 6530 | `rgb(255 255 255 / 0.55)` |
| 6539 | `rgb(49 137 255 / 0.42)` |
| 6541 | `linear-gradient(180deg, rgb(255 255 255 / 0.98), rgb(233 243 255 / 0.92))` |
| 6543 | `rgb(35 101 190 / 0.13)` |
| 6549 | `rgb(63 145 255 / 0.5)` |
| 6551 | `linear-gradient(180deg, rgb(44 67 111 / 0.92), rgb(24 35 65 / 0.94))` |
| 6553 | `rgb(0 0 0 / 0.24)` |
| 6554 | `rgb(36 129 255 / 0.1)` |
| 6555 | `rgb(255 255 255 / 0.13)` |
| 6561 | `linear-gradient(180deg, rgb(255 255 255 / 0.78), rgb(226 240 255 / 0.64))` |
| 6562 | `rgb(255 255 255 / 0.9)` |
| 6567 | `linear-gradient(180deg, rgb(32 62 105 / 0.78), rgb(18 35 67 / 0.72))` |
| 6569 | `rgb(30 126 255 / 0.08)` |
| 6570, 23171 | `rgb(255 255 255 / 0.1)` |
| 6575 | `rgb(25 128 255 / 0.62)` |
| 6577 | `rgb(24 125 255 / 0.1)` |
| 6578 | `rgb(255 255 255 / 0.5)` |
| 6608 | `#0056b3` |
| 6613 | `#003d80` |
| 6618, 10532 | `rgba(255, 255, 255, 0.02)` |
| 6640 | `rgb(58 145 255 / 0.24)` |
| 6642 | `rgb(68 197 255 / 0.035)` |
| 6643 | `rgb(43 91 184 / 0.08)` |
| 6644 | `rgb(62 185 255 / 0.055)` |
| 6645 | `rgb(98 83 255 / 0.025)` |
| 6656 | `linear-gradient(145deg, rgb(255 255 255 / 0.94), rgb(247 250 255 / 0.92))` |
| 6672 | `rgb(50 163 255 / 0.38)` |
| 6674 | `rgb(45 92 188 / 0.11)` |
| 6675 | `rgb(34 193 255 / 0.09)` |
| 6676 | `rgb(126 79 255 / 0.035)` |
| 6688 | `rgb(35 171 255 / 0.12)` |
| 6689 | `rgb(126 79 255 / 0.07)` |
| 6694 | `rgb(30 185 255 / 0.16))` |
| 6695 | `rgb(126 79 255 / 0.08))` |
| 6699 | `rgb(35 177 111 / 0.27)` |
| 6701 | `rgb(30 123 82 / 0.07)` |
| 6702 | `rgb(49 213 131 / 0.065)` |
| 6703 | `rgb(49 213 131 / 0.025)` |
| 6707 | `rgb(234 77 115 / 0.25)` |
| 6709 | `rgb(162 46 78 / 0.065)` |
| 6710 | `rgb(255 79 119 / 0.06)` |
| 6711 | `rgb(255 79 119 / 0.025)` |
| 6715 | `rgb(49 163 255 / 0.3)` |
| 6717 | `linear-gradient(90deg, rgb(42 199 255 / 0.075), rgb(73 111 255 / 0.055) 58%, rgb(145 74 255 / 0.065))` |
| 6719 | `rgb(37 147 255 / 0.06)` |
| 6720 | `rgb(109 77 255 / 0.045)` |
| 6729 | `rgb(29 174 255 / 0.13)` |
| 6730 | `rgb(125 79 255 / 0.07)` |
| 6734 | `rgb(49 160 255 / 0.2)` |
| 6735 | `linear-gradient(90deg, rgb(244 251 255 / 0.94), rgb(249 248 255 / 0.96), rgb(246 242 255 / 0.92))` |
| 6737 | `rgb(37 177 255 / 0.07)` |
| 6738 | `rgb(94 83 255 / 0.035)` |
| 6749 | `rgb(31 176 255 / 0.09)` |
| 6750 | `rgb(119 79 255 / 0.04)` |
| 6755 | `rgb(39 196 255 / 0.42)` |
| 6756, 6776 | `linear-gradient(145deg, rgb(7 18 40 / 0.96), rgb(7 13 31 / 0.98))` |
| 6758 | `rgb(52 115 255 / 0.08)` |
| 6759 | `rgb(0 199 255 / 0.12)` |
| 6760 | `rgb(0 4 18 / 0.34)` |
| 6761 | `rgb(27 113 255 / 0.05)` |
| 6766 | `rgb(37 191 255 / 0.25)` |
| 6767 | `rgb(126 77 255 / 0.16)` |
| 6771 | `rgb(34 211 238 / 0.42))` |
| 6772 | `rgb(126 77 255 / 0.2))` |
| 6781 | `rgb(49 213 131 / 0.38)` |
| 6783 | `rgb(49 213 131 / 0.1)` |
| 6784, 6792 | `rgb(0 4 18 / 0.3)` |
| 6785 | `rgb(49 213 131 / 0.045)` |
| 6789 | `rgb(255 79 119 / 0.38)` |
| 6791 | `rgb(255 67 110 / 0.1)` |
| 6793 | `rgb(255 67 110 / 0.045)` |
| 6801 | `rgb(45 193 255 / 0.42)` |
| 6803 | `linear-gradient(90deg, rgb(26 197 255 / 0.1), rgb(67 92 255 / 0.08) 58%, rgb(145 66 255 / 0.09))` |
| 6805 | `rgb(35 155 255 / 0.1)` |
| 6806 | `rgb(83 79 255 / 0.09)` |
| 6811 | `linear-gradient(90deg, rgb(26 197 255 / 0.14), rgb(72 82 255 / 0.11) 58%, rgb(145 66 255 / 0.12))` |
| 6815 | `rgb(81 207 255)` |
| 6817 | `rgb(27 195 255 / 0.3)` |
| 6818 | `rgb(130 76 255 / 0.18)` |
| 6822 | `rgb(153 229 255)` |
| 6824 | `rgb(27 195 255 / 0.48)` |
| 6825 | `rgb(130 76 255 / 0.3)` |
| 6829 | `rgb(43 190 255 / 0.3)` |
| 6830 | `linear-gradient(90deg, rgb(7 20 43 / 0.96), rgb(8 13 32 / 0.98), rgb(19 11 43 / 0.94))` |
| 6832 | `rgb(17 184 255 / 0.11)` |
| 6833 | `rgb(44 116 255 / 0.07)` |
| 6837 | `rgb(166 213 255)` |
| 6838 | `rgb(34 193 255 / 0.26)` |
| 6842 | `rgb(107 215 255)` |
| 6844 | `rgb(29 197 255 / 0.3)` |
| 6845 | `rgb(127 79 255 / 0.18)` |
| 6850 | `rgb(178 235 255)` |
| 6852 | `rgb(29 197 255 / 0.46)` |
| 6853 | `rgb(127 79 255 / 0.3)` |
| 6859, 6860 | `linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 18px), transparent)` |
| 6910 | `rgba(255, 255, 255, 0.13)` |
| 6913 | `rgba(0, 0, 0, 0.18)` |
| 6921 | `#31d583` |
| 6925 | `#ff5f6d` |
| 6951 | `hsl(var(--muted-foreground) / 0.18)` |
| 7102, 7620, 7639, 9687, 10794, 10855, 11680, 12015, 12031, 13423, 13441, 24910 | `hsl(var(--primary) / 0.2)` |
| 7162 | `linear-gradient(90deg, transparent, hsl(var(--primary)/0.3), transparent)` |
| 7213, 8165, 11609 | `hsl(var(--primary) / 0.4)` |
| 7320 | `rgb(15 23 42 / 0.05)` |
| 7344 | `hsl(var(--primary) / 0.38)` |
| 7350 | `rgb(15 23 42 / 0.1)` |
| 7368 | `hsl(var(--primary) / 0.34)` |
| 7369 | `rgb(30 64 175 / 0.09)` |
| 7402, 7523, 15507 | `#050b16` |
| 7408, 7516 | `radial-gradient(circle at 20% 20%, rgba(120, 170, 255, 0.18), transparent 35%)` |
| 7409, 7517 | `radial-gradient(circle at 80% 30%, rgba(180, 120, 255, 0.16), transparent 35%)` |
| 7410, 7518 | `radial-gradient(circle at 60% 80%, rgba(255, 170, 220, 0.12), transparent 40%)` |
| 7411, 7519 | `linear-gradient(135deg, #f7f9ff 0%, #eef2ff 45%, #f8f2ff 100%)` |
| 7426, 15526, 15536, 16635 | `#07101f` |
| 7427, 15525 | `rgb(90 135 182 / 0.16)` |
| 7429 | `rgb(255 255 255 / 0.025)` |
| 7433, 15551, 15769, 16189 | `#0b1528` |
| 7434, 15550 | `rgb(90 135 182 / 0.18)` |
| 7435 | `rgb(0 0 0 / 0.78)` |
| 7440 | `#131625` |
| 7448 | `#0d101d` |
| 7449 | `#252a3d` |
| 7453 | `#111522` |
| 7454 | `rgb(0 123 255 / 0.48)` |
| 7458 | `#080a14` |
| 7459 | `#202438` |
| 7477 | `rgb(0 123 255 / 0.28)` |
| 7478 | `rgb(90 151 255 / 0.16)` |
| 7483 | `rgb(0 86 179 / 0.38)` |
| 7493 | `rgb(0 123 255 / 0.52)` |
| 7495 | `rgb(0 123 255 / 0.14)` |
| 7496 | `rgb(0 123 255 / 0.07)` |
| 7502 | `rgb(0 123 255 / 0.46)` |
| 7524, 15506 | `radial-gradient(circle at 72% 2%, rgb(77 103 255 / 0.075), transparent 34%)` |
| 7557 | `rgb(0 123 255 / 0.22)` |
| 7558 | `rgb(92 80 246 / 0.48)` |
| 7559 | `rgb(138 43 226 / 0.22)` |
| 7564 | `rgb(0 123 255 / 0.16)` |
| 7605 | `hsl(var(--foreground) / 0.065)` |
| 7609, 21248 | `hsl(var(--primary) / 0.24)` |
| 7611, 15521 | `hsl(var(--foreground) / 0.02)` |
| 7612, 12898, 14731 | `hsl(var(--primary) / 0.035)` |
| 7616, 10541, 24856 | `hsl(var(--foreground) / 0.05)` |
| 7643, 7644 | `hsl(var(--foreground) / 0.055)` |
| 7664 | `rgb(15 23 42 / 0.075)` |
| 7680 | `rgb(255 255 255 / 0.055)` |
| 8024 | `hsl(var(--border) / 0.82)` |
| 8028 | `hsl(230 48% 4% / 0.2)` |
| 8038, 8159 | `hsl(var(--border) / 0.58)` |
| 8052 | `hsl(var(--border) / 0.88)` |
| 8054 | `hsl(var(--input) / 0.72)` |
| 8059, 8119, 21027 | `hsl(var(--primary) / 0.72)` |
| 8114 | `hsl(var(--muted) / 0.62)` |
| 8120 | `linear-gradient(135deg, hsl(var(--primary)), hsl(252 82% 58%))` |
| 8121, 9692, 11507, 20849 | `hsl(var(--primary) / 0.18)` |
| 8166 | `linear-gradient(90deg, hsl(var(--primary) / 0.16), hsl(252 82% 58% / 0.08))` |
| 8227 | `rgb(82 112 161 / 0.34)` |
| 8228 | `linear-gradient(145deg, rgb(8 18 36 / 0.99), rgb(5 13 28 / 0.99))` |
| 8229 | `rgb(0 3 12 / 0.4)` |
| 8233 | `rgb(82 112 161 / 0.24)` |
| 8314 | `radial-gradient(circle at 32% 40%, rgb(34 211 238 / 10%), transparent 45%)` |
| 8315 | `radial-gradient(circle at 68% 55%, rgb(124 58 237 / 9%), transparent 48%)` |
| 8333, 8477, 8546, 8704, 8842, 8961, 9082, 9125, 9233 | `rgb(2 132 199)` |
| 8334, 8547, 8705, 8843, 8962 | `rgb(34 211 238 / 22%)` |
| 8339, 8430, 8552, 8644, 8710, 8848, 8967, 9145, 9153, 9215, 9394 | `rgb(37 99 235 / 9%)` |
| 8340, 8553, 8711, 8849, 8968, 9146, 9154, 9446, 22576 | `rgb(124 58 237 / 7%)` |
| 8351, 8482, 9142, 9198, 9258 | `rgb(59 130 246 / 28%)` |
| 8353, 8560, 8732, 8855, 8974, 9097, 9152, 9179, 9200, 9278, 22575 | `rgb(37 99 235 / 5%)` |
| 8354, 8372, 8485, 8561, 8733, 8741, 8856, 8877, 8975, 8996, 9164 | `rgb(37 99 235 / 7%)` |
| 8355, 8562, 8734, 8857, 8976 | `rgb(124 58 237 / 5%)` |
| 8365, 8586, 9112 | `rgb(34 211 238 / 14%)` |
| 8366, 8431, 9113 | `rgb(124 58 237 / 11%)` |
| 8370, 8428, 8739, 8875, 8994 | `rgb(34 211 238 / 38%)` |
| 8373, 8781, 9089, 9171, 9355, 9422, 22819 | `rgb(37 99 235 / 10%)` |
| 8374, 8594, 9090, 9172, 9388, 9402, 22820 | `rgb(124 58 237 / 8%)` |
| 8378, 8424, 8465, 8502, 8751, 9098, 9119, 9261, 9386, 22467, 22818 | `rgb(37 99 235 / 8%)` |
| 8384 | `radial-gradient(circle at 30% 38%, rgb(34 211 238 / 17%), transparent 45%)` |
| 8385, 8614 | `radial-gradient(circle at 70% 58%, rgb(124 58 237 / 16%), transparent 48%)` |
| 8390, 8619, 8763, 8891, 9010, 9312, 9412 | `rgb(56 189 248)` |
| 8392, 8621, 8765, 8893, 9012 | `rgb(34 211 238 / 60%)` |
| 8393, 8622, 8766, 8894, 9013 | `rgb(37 99 235 / 32%)` |
| 8399, 8416, 8628, 8772, 8791, 8900, 8917, 9019, 9036, 9222, 9431 | `rgb(37 99 235 / 22%)` |
| 8400, 8629, 8773, 8901, 9020 | `rgb(124 58 237 / 16%)` |
| 8404, 8633 | `rgb(56 189 248 / 48%)` |
| 8405 | `rgb(7 20 38 / 84%)` |
| 8407, 8636, 8742, 8878, 8908, 8997, 9027, 9445 | `rgb(37 99 235 / 11%)` |
| 8408, 8909, 9028, 9285, 9423 | `rgb(37 99 235 / 17%)` |
| 8409, 8910, 9029, 9223 | `rgb(124 58 237 / 13%)` |
| 8413, 9370 | `rgb(103 232 249 / 66%)` |
| 8415, 8916, 9035 | `rgb(37 99 235 / 15%)` |
| 8417, 8792, 8918, 9037, 9323, 22829 | `rgb(124 58 237 / 18%)` |
| 8421, 9150 | `rgb(59 130 246 / 30%)` |
| 8423, 8584, 8725, 9271 | `rgb(37 99 235 / 6%)` |
| 8437, 8478, 8659, 8804, 8924, 9043, 9234, 9379, 9438 | `rgb(34 211 238 / 18%)` |
| 8438, 8607, 8783, 8805, 8925, 9044, 9216, 9292, 9439 | `rgb(124 58 237 / 12%)` |
| 8455 | `radial-gradient(circle at 34% 18%, rgb(34 211 238 / 4%), transparent 32%)` |
| 8456 | `radial-gradient(circle at 68% 28%, rgb(124 58 237 / 4%), transparent 34%)` |
| 8469, 8578, 8724, 9144, 9194, 9260 | `rgb(37 99 235 / 4%)` |
| 8484, 9214 | `rgb(34 211 238 / 12%)` |
| 8490 | `radial-gradient(circle at 32% 16%, rgb(34 211 238 / 8%), transparent 34%)` |
| 8491 | `radial-gradient(circle at 70% 25%, rgb(124 58 237 / 9%), transparent 36%)` |
| 8497, 9083, 9186 | `rgb(34 211 238 / 24%)` |
| 8498, 8782, 9208 | `rgb(37 99 235 / 16%)` |
| 8507 | `rgb(103 232 249)` |
| 8509 | `rgb(34 211 238 / 44%)` |
| 8510, 9229, 9298, 9415 | `rgb(124 58 237 / 20%)` |
| 8527 | `radial-gradient(circle at 34% 38%, rgb(34 211 238 / 9%), transparent 45%)` |
| 8528 | `radial-gradient(circle at 68% 56%, rgb(124 58 237 / 8%), transparent 48%)` |
| 8558, 8730, 8853, 8972, 9277 | `rgb(59 130 246 / 26%)` |
| 8572, 8870, 8989 | `rgb(34 211 238 / 13%)` |
| 8573, 8871, 8990, 9121, 9166, 9273 | `rgb(124 58 237 / 10%)` |
| 8577, 8722, 9176, 9193, 22465 | `rgb(59 130 246 / 24%)` |
| 8582 | `rgb(14 165 233 / 54%)` |
| 8585 | `rgb(14 165 233 / 20%)` |
| 8590 | `linear-gradient(90deg, rgb(6 182 212), rgb(37 99 235), rgb(124 58 237))` |
| 8591 | `rgb(96 165 250 / 34%)` |
| 8593, 8790, 9430 | `rgb(37 99 235 / 14%)` |
| 8605, 9291, 9364, 22828 | `rgb(37 99 235 / 20%)` |
| 8606 | `rgb(34 211 238 / 16%)` |
| 8613 | `radial-gradient(circle at 32% 38%, rgb(34 211 238 / 17%), transparent 45%)` |
| 8634, 9420 | `rgb(7 20 38 / 88%)` |
| 8637, 9332, 9356, 9372 | `rgb(37 99 235 / 18%)` |
| 8638, 8653, 9333, 9341, 9424 | `rgb(124 58 237 / 14%)` |
| 8642 | `rgb(59 130 246 / 38%)` |
| 8643 | `rgb(8 22 42 / 88%)` |
| 8648 | `rgb(103 232 249 / 68%)` |
| 8650, 9363 | `rgb(37 99 235 / 13%)` |
| 8651, 8667, 9126 | `rgb(34 211 238 / 28%)` |
| 8652 | `rgb(34 211 238 / 25%)` |
| 8658 | `rgb(37 99 235 / 26%)` |
| 8660, 9357, 9380 | `rgb(124 58 237 / 15%)` |
| 8666, 9315 | `rgb(37 99 235 / 34%)` |
| 8668, 9187 | `rgb(124 58 237 / 22%)` |
| 8685 | `radial-gradient(circle at 30% 38%, rgb(34 211 238 / 9%), transparent 44%)` |
| 8686 | `radial-gradient(circle at 72% 54%, rgb(124 58 237 / 8%), transparent 48%)` |
| 8726, 9201 | `rgb(124 58 237 / 4%)` |
| 8743, 8879, 8998 | `rgb(124 58 237 / 9%)` |
| 8747 | `rgb(37 99 235 / 14%))` |
| 8757 | `radial-gradient(circle at 28% 36%, rgb(34 211 238 / 17%), transparent 45%)` |
| 8758 | `radial-gradient(circle at 72% 56%, rgb(124 58 237 / 16%), transparent 48%)` |
| 8778, 9419 | `rgb(56 189 248 / 42%)` |
| 8779, 8906, 9025, 9329 | `rgb(7 20 38 / 86%)` |
| 8788, 9428 | `rgb(103 232 249 / 62%)` |
| 8797 | `rgb(34 211 238 / 32%))` |
| 8798 | `rgb(124 58 237 / 20%))` |
| 8823 | `radial-gradient(circle at 32% 36%, rgb(34 211 238 / 9%), transparent 44%)` |
| 8824 | `radial-gradient(circle at 70% 58%, rgb(124 58 237 / 8%), transparent 48%)` |
| 8885 | `radial-gradient(circle at 30% 35%, rgb(34 211 238 / 17%), transparent 45%)` |
| 8886 | `radial-gradient(circle at 72% 58%, rgb(124 58 237 / 16%), transparent 48%)` |
| 8905, 9024, 9353 | `rgb(56 189 248 / 44%)` |
| 8914, 9033 | `rgb(103 232 249 / 64%)` |
| 8942 | `radial-gradient(circle at 32% 34%, rgb(34 211 238 / 9%), transparent 44%)` |
| 8943 | `radial-gradient(circle at 70% 60%, rgb(124 58 237 / 8%), transparent 48%)` |
| 9004 | `radial-gradient(circle at 30% 34%, rgb(34 211 238 / 17%), transparent 45%)` |
| 9005 | `radial-gradient(circle at 72% 60%, rgb(124 58 237 / 16%), transparent 48%)` |
| 9062 | `radial-gradient(circle at 30% 36%, rgb(34 211 238 / 10%), transparent 44%)` |
| 9063 | `radial-gradient(circle at 72% 58%, rgb(124 58 237 / 9%), transparent 48%)` |
| 9095 | `rgb(59 130 246 / 27%)` |
| 9099, 9262, 9395 | `rgb(124 58 237 / 6%)` |
| 9117 | `rgb(34 211 238 / 40%)` |
| 9120, 9165, 9272, 9331, 9387, 9401 | `rgb(37 99 235 / 12%)` |
| 9131 | `rgb(0 0 0 / 14%)` |
| 9132 | `rgb(0 212 255 / 14%)` |
| 9133 | `rgb(139 44 255 / 9%)` |
| 9134 | `rgb(255 255 255 / 10%)` |
| 9162, 9269 | `rgb(34 211 238 / 46%)` |
| 9178 | `rgb(37 99 235 / 3%)` |
| 9205 | `rgb(34 211 238 / 70%)` |
| 9207, 9284 | `rgb(34 211 238 / 11%)` |
| 9212 | `rgb(34 211 238 / 72%)` |
| 9220, 9289 | `linear-gradient(105deg, #06b6d4 0%, #2563eb 52%, #7c3aed 100%)` |
| 9228 | `rgb(37 99 235 / 30%)` |
| 9245, 15394, 19646, 22827 | `#22d3ee` |
| 9246, 21707, 21823, 23083 | `#2563eb` |
| 9247, 12311 | `#7c3aed` |
| 9253 | `rgb(34 211 238 / 24%))` |
| 9254 | `rgb(124 58 237 / 16%))` |
| 9282 | `rgb(34 211 238 / 68%)` |
| 9297 | `rgb(37 99 235 / 29%)` |
| 9305 | `radial-gradient(circle at 28% 35%, rgb(34 211 238 / 18%), transparent 45%)` |
| 9306 | `radial-gradient(circle at 72% 58%, rgb(124 58 237 / 17%), transparent 48%)` |
| 9314 | `rgb(34 211 238 / 62%)` |
| 9322 | `rgb(37 99 235 / 24%)` |
| 9328 | `rgb(56 189 248 / 45%)` |
| 9340 | `rgb(34 211 238 / 20%)` |
| 9346 | `rgb(0 0 0 / 58%)` |
| 9347 | `rgb(0 212 255 / 20%)` |
| 9348 | `rgb(139 44 255 / 14%)` |
| 9349 | `rgb(255 255 255 / 9%)` |
| 9361 | `rgb(56 189 248 / 46%)` |
| 9365 | `rgb(124 58 237 / 17%)` |
| 9373 | `rgb(37 99 235 / 27%)` |
| 9374 | `rgb(124 58 237 / 23%)` |
| 9384 | `rgb(56 189 248 / 34%)` |
| 9392 | `rgb(56 189 248 / 32%)` |
| 9399 | `rgb(56 189 248 / 38%)` |
| 9407 | `rgb(34 211 238 / 44%))` |
| 9408 | `rgb(124 58 237 / 28%))` |
| 9414 | `rgb(34 211 238 / 35%)` |
| 9432 | `rgb(124 58 237 / 19%)` |
| 9443 | `rgb(56 189 248 / 36%)` |
| 9471, 9520, 9534, 14019, 14030, 14095, 14106, 15920, 19027 | `#f4f7ff` |
| 9587 | `#8fa0c0` |
| 9636 | `rgb(116 145 197 / 0.24)` |
| 9637 | `rgb(8 20 48 / 0.88)` |
| 9638 | `#dce7fb` |
| 9643 | `linear-gradient(105deg, #10d4ee 0%, #168cf7 48%, #7135f5 100%)` |
| 9645 | `rgb(23 111 245 / 0.24)` |
| 9959 | `radial-gradient(circle at 18% 12%, rgb(0 123 255 / 0.055), transparent 32rem)` |
| 9960 | `radial-gradient(circle at 88% 78%, rgb(138 43 226 / 0.04), transparent 36rem)` |
| 9967, 11389 | `rgb(15 23 42 / 0.14)` |
| 10000 | `linear-gradient(90deg, rgb(0 123 255 / 0.12), rgb(138 43 226 / 0.065))` |
| 10008 | `rgba(15,23,42,0.14)` |
| 10029 | `rgb(15 23 42 / 0.28)` |
| 10040 | `rgb(83 105 255 / 0.48)` |
| 10041 | `linear-gradient(135deg, #0061cc 0%, #3856d6 52%, #5130c5 100%)` |
| 10043 | `rgb(0 123 255 / 0.7)` |
| 10044 | `rgb(138 43 226 / 0.08)` |
| 10093 | `linear-gradient(90deg, #007bff, #7047e8)` |
| 10095 | `rgb(0 123 255 / 0.72)` |
| 10096 | `rgb(90 151 255 / 0.14)` |
| 10100 | `linear-gradient(90deg, #006fe8, #6538da)` |
| 10102 | `rgb(0 102 230 / 0.78)` |
| 10103 | `rgb(112 71 232 / 0.14)` |
| 10133 | `#060711` |
| 10135 | `radial-gradient(circle at 16% 15%, rgb(0 123 255 / 0.08), transparent 34rem)` |
| 10136 | `radial-gradient(circle at 84% 72%, rgb(109 40 217 / 0.065), transparent 38rem)` |
| 10204, 21021 | `hsl(var(--muted-foreground) / 0.72)` |
| 10208 | `rgb(255 255 255 / 0.52)` |
| 10348 | `linear-gradient(145deg, hsl(var(--primary) / 0.14), hsl(var(--accent) / 0.12))` |
| 10521 | `rgba(0, 0, 0, 0.1)` |
| 10522, 17129, 22095 | `rgba(255, 255, 255, 0.6)` |
| 10523 | `rgba(255, 255, 255, 0.15)` |
| 10524, 10533, 10590 | `hsl(var(--foreground) / 0.08)` |
| 10525 | `linear-gradient(145deg, hsl(var(--card)), hsl(var(--background)))` |
| 10540 | `hsl(var(--muted) / 0.8)` |
| 10555 | `rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` |
| 10556, 21664 | `rgba(255, 255, 255, 0.8)` |
| 10597 | `hsl(var(--primary) / 0.2), 0 4px 12px hsl(var(--primary)/0.08)` |
| 10612 | `hsl(var(--foreground)/0.08)` |
| 10615, 11902, 20353, 20486 | `rgba(0, 0, 0, 0.05)` |
| 10617, 10636 | `rgba(255,255,255,0.5)` |
| 10627, 10737 | `rgba(0, 0, 0, 0.3)` |
| 10634 | `hsl(var(--primary)/0.15)` |
| 10637 | `hsl(var(--primary)/0.3)` |
| 10642 | `hsl(var(--primary)/0.25)` |
| 10733 | `rgba(0, 0, 0, 0.08)` |
| 10766, 11416, 11526, 13190, 22997 | `hsl(var(--border) / 0.5)` |
| 10796 | `linear-gradient(135deg, hsl(var(--primary) / 0.05), hsl(var(--accent) / 0.05))` |
| 10801 | `linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.1))` |
| 11005 | `hsl(var(--foreground) / 0.1)` |
| 11309 | `hsl(var(--foreground) / 0.68)` |
| 11382 | `hsl(var(--foreground) / 0.16)` |
| 11390 | `hsl(var(--background) / 0.45)` |
| 11485 | `hsl(var(--muted-foreground) / 0.4)` |
| 11502, 11614, 16414, 16443, 23764, 23887 | `linear-gradient(hsl(var(--card)), hsl(var(--card)))` |
| 11503 | `linear-gradient(135deg, hsl(var(--primary) / 0.8), hsl(var(--accent) / 0.58))` |
| 11508 | `hsl(var(--background) / 0.75)` |
| 11514, 11564 | `hsl(var(--primary) / 0.25)` |
| 11515, 11618, 11770, 21028 | `hsl(var(--primary) / 0.12)` |
| 11516 | `hsl(var(--background) / 0.8)` |
| 11553, 11578, 11605 | `hsl(var(--border) / 0.4)` |
| 11615 | `linear-gradient(135deg, hsl(var(--primary) / 0.9), hsl(var(--accent) / 0.68))` |
| 11909 | `hsl(var(--primary) / 0.3), 0 1px 2px 0 rgba(0, 0, 0, 0.05)` |
| 12070 | `rgb(8 123 255 / 0.24)` |
| 12073 | `linear-gradient(112deg, rgb(19 221 244 / 0.075), rgb(8 123 255 / 0.045) 48%, rgb(122 44 255 / 0.055))` |
| 12075 | `hsl(var(--foreground) / 0.04)` |
| 12082 | `linear-gradient(180deg, var(--widget-brand-cyan), var(--widget-brand-blue))` |
| 12108 | `rgb(8 123 255 / 0.12)` |
| 12112, 13498 | `rgb(19 221 244 / 0.2)` |
| 12114 | `linear-gradient(112deg, rgb(19 221 244 / 0.08), rgb(8 123 255 / 0.055) 48%, rgb(122 44 255 / 0.065))` |
| 12277 | `hsl(var(--muted-foreground) / 0.8)` |
| 12305 | `#f7931a` |
| 12306 | `#627eea` |
| 12307 | `#26a17b` |
| 12308 | `#2775ca` |
| 12309 | `#f3ba2f` |
| 12310 | `#23292f` |
| 12312 | `#ef0027` |
| 12313 | `#2566d4` |
| 12314 | `#c2a633` |
| 12315 | `#e6007a` |
| 12316 | `#345d9d` |
| 12401, 12472 | `linear-gradient(112deg, #13ddf4 0%, #087bff 34%, #2448ff 68%, #7a2cff 100%)` |
| 12404, 12437, 12473 | `#2448ff` |
| 12425 | `rgb(255 255 255 / 0.34)` |
| 12429, 12544, 12610, 12615, 12972 | `rgb(36 72 255 / 0.2)` |
| 12430 | `rgb(255 255 255 / 0.4)` |
| 12434, 13497, 13548 | `rgb(36 72 255 / 0.34)` |
| 12436 | `linear-gradient(112deg, rgb(19 221 244 / 0.075), rgb(8 123 255 / 0.065) 42%, rgb(122 44 255 / 0.075))` |
| 12445, 12643, 13509 | `rgb(36 72 255 / 0.42)` |
| 12446, 24108 | `rgb(8 123 255 / 0.09)` |
| 12450, 20621 | `rgb(36 72 255 / 0.18)` |
| 12451 | `linear-gradient(112deg, rgb(19 221 244 / 0.08), rgb(36 72 255 / 0.07), rgb(122 44 255 / 0.08))` |
| 12456, 12558 | `linear-gradient(145deg, #12172a 0%, #0f1324 100%)` |
| 12459, 12561 | `rgb(0 0 0 / 0.38)` |
| 12460 | `rgb(122 44 255 / 0.1)` |
| 12461, 24134 | `rgb(8 123 255 / 0.055)` |
| 12462, 12564, 16462 | `rgb(255 255 255 / 0.075)` |
| 12466 | `#111628` |
| 12479 | `linear-gradient(145deg, #fff 0%, #fbfcff 100%)` |
| 12482 | `rgb(25 68 128 / 0.11)` |
| 12483 | `rgb(36 72 255 / 0.065)` |
| 12484 | `rgb(19 221 244 / 0.035)` |
| 12485 | `rgb(255 255 255 / 0.94)` |
| 12499, 12880, 20318 | `#e3e6eb` |
| 12513, 20339, 20352, 20374, 20401, 20432, 20469, 20497, 20508, 20522, 20557, 20564, 20600 | `#64748b` |
| 12517, 20343, 20410, 20501 | `linear-gradient(112deg, #13ddf4 0%, #087bff 34%, #2448ff 68%, #7a2cff 100%))` |
| 12520, 19700, 20346, 20504 | `rgba(36, 72, 255, 0.2)` |
| 12531, 20319, 20329, 20423 | `#1e293b` |
| 12540 | `rgb(255 255 255 / 0.58)` |
| 12545 | `rgb(255 255 255 / 0.42)` |
| 12562 | `rgb(122 44 255 / 0.085)` |
| 12563 | `rgb(8 123 255 / 0.045)` |
| 12574 | `rgb(36 72 255 / 0.16)` |
| 12581 | `rgb(36 72 255 / 0.22)` |
| 12589, 13493 | `rgb(255 255 255 / 0.32)` |
| 12593 | `rgb(36 72 255 / 0.17)` |
| 12611 | `linear-gradient(135deg, rgb(19 221 244 / 0.12), rgb(36 72 255 / 0.1), rgb(122 44 255 / 0.13))` |
| 12616 | `linear-gradient(112deg, rgb(19 221 244 / 0.065), rgb(36 72 255 / 0.055), rgb(122 44 255 / 0.07))` |
| 12627 | `linear-gradient(112deg, rgb(19 221 244 / 0.075), rgb(8 123 255 / 0.06) 42%, rgb(122 44 255 / 0.075))` |
| 12628 | `linear-gradient(125deg, rgb(19 221 244 / 0.52), rgb(8 123 255 / 0.46) 48%, rgb(122 44 255 / 0.5))` |
| 12631, 20536, 20575 | `rgb(8 123 255 / 0.08)` |
| 12632 | `rgb(122 44 255 / 0.045)` |
| 12644, 24141 | `rgb(8 123 255 / 0.085)` |
| 12823, 12855, 15730, 20696, 21255 | `hsl(var(--foreground) / 0.035)` |
| 12875 | `hsl(var(--primary) / 0.45)` |
| 12876, 20785 | `hsl(var(--primary) / 0.07)` |
| 12897 | `hsl(var(--primary) / 0.58)` |
| 12964 | `linear-gradient(135deg, #13ddf4 0%, #2448ff 54%, #7a2cff 100%)` |
| 13000 | `hsl(var(--primary) / 0.26)` |
| 13371 | `linear-gradient(hsl(var(--background)), hsl(var(--background)))` |
| 13372 | `linear-gradient(125deg, rgb(19 221 244 / 0.74), rgb(36 72 255 / 0.68), rgb(122 44 255 / 0.7))` |
| 13374, 13668, 20540 | `rgb(15 23 42 / 0.2)` |
| 13375, 24115 | `rgb(8 123 255 / 0.13)` |
| 13376, 24104 | `rgb(122 44 255 / 0.08)` |
| 13431 | `hsl(var(--background) / 0.88)` |
| 13452 | `linear-gradient(135deg, hsl(var(--primary) / 0.14), hsl(var(--accent) / 0.18))` |
| 13461 | `linear-gradient(135deg, hsl(var(--primary) / 0.22), hsl(var(--accent) / 0.26))` |
| 13494 | `linear-gradient(135deg, #13ddf4 0%, #2448ff 52%, #7a2cff 100%)` |
| 13499, 13550 | `rgb(122 44 255 / 0.16)` |
| 13510 | `rgb(19 221 244 / 0.25)` |
| 13511 | `rgb(122 44 255 / 0.2)` |
| 13517 | `rgb(20 25 70 / 0.35))` |
| 13536, 24813 | `hsl(var(--primary) / 0.32)` |
| 13545, 13576 | `linear-gradient(112deg, #13DDF4 0%, #087BFF 34%, #2448FF 67%, #7A2CFF 100%)` |
| 13549 | `rgb(19 221 244 / 0.18)` |
| 13561 | `linear-gradient(180deg, rgb(255 255 255 / 0.28), transparent)` |
| 13570 | `rgb(36 72 255 / 0.48)` |
| 13571 | `rgb(19 221 244 / 0.3)` |
| 13572 | `rgb(122 44 255 / 0.26)` |
| 13596 | `hsl(var(--background) / 0.2)` |
| 13602 | `hsl(var(--background) / 0.3)` |
| 13654 | `linear-gradient(#0f121e, #0f121e)` |
| 13655 | `linear-gradient(125deg, rgb(19 221 244 / 0.68), rgb(36 72 255 / 0.72), rgb(122 44 255 / 0.76))` |
| 13657 | `rgb(0 0 0 / 0.48)` |
| 13658 | `rgb(8 123 255 / 0.15)` |
| 13659 | `rgb(122 44 255 / 0.12)` |
| 13669, 24105 | `rgb(8 123 255 / 0.11)` |
| 13981, 14057, 19023 | `rgb(54 190 255 / 0.22)` |
| 13983, 14059, 19026 | `#05112d` |
| 13984, 14060 | `radial-gradient(circle at 50% 0%, rgb(36 72 255 / 0.16), transparent 56%)` |
| 14150, 22088 | `rgba(0, 0, 0, 0.2)` |
| 14210 | `#1a2133` |
| 14236, 14240 | `rgba(138, 155, 189, 0.38)` |
| 14272 | `hsl(var(--sidebar-primary-foreground)/0.1)` |
| 14283 | `rgba(255, 255, 255, 0.3))` |
| 14423, 14468, 14490, 14502 | `rgb(var(--setting-accent-rgb))` |
| 14428 | `rgba(var(--setting-accent-rgb), 0.3)` |
| 14431 | `linear-gradient(145deg, rgba(var(--setting-accent-rgb), 0.065), transparent 44%)` |
| 14432 | `#0b1220` |
| 14434 | `rgba(var(--setting-accent-rgb), 0.035)` |
| 14435, 14484 | `rgba(var(--setting-accent-rgb), 0.72)` |
| 14444 | `rgba(var(--setting-accent-rgb), 0.55)` |
| 14446 | `rgba(var(--setting-accent-rgb), 0.07)` |
| 14447 | `rgba(var(--setting-accent-rgb), 0.88)` |
| 14448 | `rgba(var(--setting-accent-rgb), 0.82)` |
| 14466 | `rgba(var(--setting-accent-rgb), 0.4)` |
| 14469 | `rgba(var(--setting-accent-rgb), 0.12)` |
| 14470 | `rgba(var(--setting-accent-rgb), 0.9)` |
| 14479, 14520 | `rgba(var(--setting-accent-rgb), 0.24)` |
| 14480 | `rgba(3, 9, 20, 0.48)` |
| 14485 | `rgba(var(--setting-accent-rgb), 0.11)` |
| 14498 | `hsl(var(--muted-foreground) / 0.55)` |
| 14503 | `rgba(var(--setting-accent-rgb), 0.8)` |
| 14516 | `color-mix(in srgb, rgb(var(--setting-accent-rgb)) 72%, #07101f)` |
| 14518 | `linear-gradient(145deg, rgba(var(--setting-accent-rgb), 0.055), transparent 42%)` |
| 14519 | `#f7f9fd` |
| 14522 | `rgba(255, 255, 255, 0.85)` |
| 14523 | `rgba(var(--setting-accent-rgb), 0.48)` |
| 14528 | `rgba(var(--setting-accent-rgb), 0.42)` |
| 14530 | `rgba(255, 255, 255, 0.9)` |
| 14531 | `rgba(var(--setting-accent-rgb), 0.58)` |
| 14532 | `rgba(var(--setting-accent-rgb), 0.5)` |
| 14536 | `rgba(255, 255, 255, 0.72)` |
| 14637 | `rgb(112 185 255 / 0.44)` |
| 14644 | `rgb(180 224 255 / 0.64)` |
| 14646 | `rgb(22 139 255 / 0.72), 0 0 20px -14px rgb(139 44 255 / 0.84)` |
| 14653 | `hsl(var(--card) / 0.9)` |
| 14661 | `hsl(var(--muted) / 0.82)` |
| 14674 | `hsl(var(--input) / 0.82)` |
| 14688 | `linear-gradient(45deg, transparent 50%, hsl(var(--muted-foreground)) 50%)` |
| 14689 | `linear-gradient(135deg, hsl(var(--muted-foreground)) 50%, transparent 50%)` |
| 14702 | `hsl(var(--primary) / 0.86)` |
| 14705 | `hsl(var(--primary) / 0.12), 0 0 18px -13px rgb(139 44 255 / 0.82)` |
| 14738 | `radial-gradient(circle at 50% 0%, hsl(var(--primary) / 0.08), transparent 45%)` |
| 14739, 15558, 16201 | `hsl(var(--muted) / 0.28)` |
| 14744 | `linear-gradient(110deg, hsl(var(--muted) / 0.32), hsl(var(--primary) / 0.07), hsl(var(--muted) / 0.32))` |
| 14750 | `hsl(var(--destructive) / 0.24)` |
| 14752 | `hsl(var(--destructive) / 0.07)` |
| 15017 | `hsl(var(--muted) / 0.6)` |
| 15087 | `hsl(var(--card) / .98)` |
| 15097 | `hsl(224 40% 8% / .065)` |
| 15196 | `hsl(224 40% 8% / .06)` |
| 15336 | `rgba(3, 7, 16, .68)` |
| 15357 | `rgba(105, 132, 190, .24)` |
| 15359 | `#0d1320` |
| 15360 | `#f5f7fb` |
| 15361 | `rgba(4, 11, 27, .42), 0 0 0 1px rgba(57, 189, 248, .04)` |
| 15374 | `#b9c4d8` |
| 15384 | `rgba(76, 140, 255, .22)` |
| 15385 | `rgba(37, 99, 235, .10)` |
| 15386, 15393, 19520 | `#f8fbff` |
| 15391 | `rgba(69, 154, 255, .34)` |
| 15392 | `linear-gradient(105deg, rgba(34, 211, 238, .10), rgba(59, 130, 246, .14) 52%, rgba(168, 85, 247, .10))` |
| 15399 | `rgba(127, 146, 181, .20)` |
| 15405 | `#9aa8c0` |
| 15410 | `#e6edfa` |
| 15459 | `#071222` |
| 15499 | `radial-gradient(circle at 72% 2%, rgb(77 103 255 / 0.045), transparent 34%)` |
| 15519 | `hsl(var(--border) / 0.38)` |
| 15520 | `hsl(var(--background) / 0.96)` |
| 15530 | `hsl(var(--border) / 0.36)` |
| 15535, 15562 | `rgb(90 135 182 / 0.14)` |
| 15543 | `hsl(var(--border) / 0.42)` |
| 15546 | `hsl(220 64% 4% / 0.72)` |
| 15552 | `rgb(0 0 0 / 0.88)` |
| 15556 | `hsl(var(--border) / 0.34)` |
| 15563 | `#091426` |
| 15717 | `color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 18%, hsl(var(--border)))` |
| 15719 | `radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 10%, transparent), transparent 46%)` |
| 15722 | `hsl(var(--foreground) / 0.025)` |
| 15723 | `color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 60%, transparent)` |
| 15728 | `color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 34%, hsl(var(--border)))` |
| 15731 | `color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 72%, transparent)` |
| 15768 | `radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--dashboard-stat-accent, #087bff) 13%, transparent), transparent 48%)` |
| 15802 | `hsl(var(--primary)))` |
| 15803 | `color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 24%, transparent)` |
| 15804 | `color-mix(in srgb, var(--dashboard-stat-accent, hsl(var(--primary))) 12%, transparent)` |
| 15820 | `rgb(167 96 255)` |
| 15838 | `linear-gradient(to left, hsl(var(--card)), transparent)` |
| 15890, 16634 | `rgb(65 146 230 / 0.24)` |
| 15891, 16654 | `#0b1729` |
| 15892, 16659 | `rgb(255 255 255 / 0.035)` |
| 15899, 15905, 16653 | `rgb(65 146 230 / 0.2)` |
| 15900, 15906 | `#0e1c31` |
| 15911 | `rgb(19 221 244 / 0.46)` |
| 15912, 16449, 20592 | `rgb(8 123 255 / 0.1)` |
| 15927 | `#a3b0c6` |
| 15997 | `hsl(var(--primary) / 0.14)` |
| 16017 | `hsl(var(--muted-foreground) / 0.14)` |
| 16021 | `linear-gradient(90deg, rgb(0 212 255 / 0.82), rgb(22 139 255 / 0.76), rgb(51 214 166 / 0.72))` |
| 16025 | `hsl(var(--muted-foreground) / 0.22)` |
| 16031 | `#22c9c9` |
| 16032 | `#2fd4a7` |
| 16036 | `#00d4ff` |
| 16037 | `linear-gradient(135deg, #00d4ff, #168bff 56%, #8b2cff)` |
| 16040 | `rgb(0 212 255 / 0.07)` |
| 16041 | `rgb(22 139 255 / 0.26)` |
| 16046 | `hsl(var(--destructive) / 0.1)` |
| 16160 | `rgb(0 212 255 / 0.32)` |
| 16162 | `linear-gradient(135deg, #00d4ff, #168bff 58%, #8b2cff)` |
| 16165 | `rgb(22 139 255 / 0.18)` |
| 16172 | `hsl(var(--border) / 0.18)` |
| 16205, 20783 | `hsl(var(--primary) / 0.16)` |
| 16211 | `hsl(var(--background) / 0.22)` |
| 16341 | `radial-gradient(circle at 48% 18%, rgb(19 221 244 / 0.055), transparent 30rem)` |
| 16342 | `radial-gradient(circle at 72% 34%, rgb(122 44 255 / 0.04), transparent 28rem)` |
| 16360 | `radial-gradient(circle, rgb(56 189 248 / 0.08) 0%, rgb(139 92 246 / 0.045) 42%, transparent 72%)` |
| 16367 | `radial-gradient(circle at 48% 18%, rgb(19 221 244 / 0.075), transparent 30rem)` |
| 16368 | `radial-gradient(circle at 72% 34%, rgb(122 44 255 / 0.07), transparent 28rem)` |
| 16369 | `linear-gradient(180deg, #050b16 0%, #07101f 100%)` |
| 16373 | `radial-gradient(circle, rgb(56 189 248 / 0.12) 0%, rgb(139 92 246 / 0.075) 42%, transparent 72%)` |
| 16415 | `linear-gradient(120deg, rgb(0 212 255 / 0.4), rgb(8 123 255 / 0.24) 58%, rgb(139 44 255 / 0.3))` |
| 16417 | `rgb(0 0 0 / 0.14)` |
| 16418 | `rgb(0 212 255 / 0.1)` |
| 16419 | `rgb(139 44 255 / 0.06)` |
| 16444 | `linear-gradient(135deg, rgb(0 212 255 / 0.42), rgb(8 123 255 / 0.38) 55%, rgb(139 44 255 / 0.58))` |
| 16446, 16726, 16758 | `rgb(0 212 255 / 0.38)` |
| 16447 | `rgb(139 44 255 / 0.3)` |
| 16448 | `rgb(0 0 0 / 0.8)` |
| 16456, 16641, 16648 | `linear-gradient(#07101f, #07101f)` |
| 16457, 16642 | `linear-gradient(120deg, rgb(0 212 255 / 0.48), rgb(8 123 255 / 0.3) 58%, rgb(139 44 255 / 0.38))` |
| 16459 | `rgb(0 0 0 / 0.55)` |
| 16460 | `rgb(0 212 255 / 0.14)` |
| 16461 | `rgb(139 44 255 / 0.09)` |
| 16504 | `rgb(0 212 255 / 0.82)` |
| 16507 | `rgb(0 212 255 / 0.12)` |
| 16508 | `rgb(0 130 255 / 0.2)` |
| 16509 | `rgb(139 44 255 / 0.08)` |
| 16530 | `linear-gradient(115deg, #00d4ff 0%, hsl(var(--primary)) 48%, #8b2cff 100%)` |
| 16541 | `hsl(var(--primary) / 0.28), 0 0 18px rgb(0 212 255 / 0.15), 0 0 26px rgb(139 44 255 / 0.08)` |
| 16546 | `hsl(var(--primary) / 0.34), 0 0 20px rgb(0 212 255 / 0.2), 0 0 32px rgb(139 44 255 / 0.12)` |
| 16605 | `hsla(var(--primary) / 0.8)` |
| 16649 | `linear-gradient(135deg, rgb(0 212 255 / 0.48), rgb(8 123 255 / 0.42) 55%, rgb(139 44 255 / 0.66))` |
| 16664 | `rgb(0 212 255 / 0.2)) drop-shadow(0 0 12px rgb(139 44 255 / 0.09))` |
| 16668 | `rgb(0 212 255 / 0.22)` |
| 16669 | `rgb(0 150 255 / 0.09)` |
| 16674 | `rgb(8 123 255 / 0.2)` |
| 16675 | `rgb(0 160 255 / 0.15), 0 0 18px rgb(139 44 255 / 0.08)` |
| 16679 | `rgb(0 174 230)` |
| 16680, 16715 | `rgb(0 212 255 / 0.16)` |
| 16684 | `#4dddff` |
| 16689 | `hsl(var(--success) / 0.42)` |
| 16690 | `linear-gradient(135deg, hsl(var(--success) / 0.14), rgb(0 212 255 / 0.09))` |
| 16691 | `hsl(var(--success) / 0.2), 0 0 18px rgb(0 212 255 / 0.1), inset 0 1px 0 rgb(255 255 255 / 0.1)` |
| 16695 | `linear-gradient(90deg, rgb(0 212 255 / 0.65), hsl(var(--primary) / 0.78), rgb(139 44 255 / 0.52))` |
| 16696 | `rgb(0 150 255 / 0.12)` |
| 16700 | `linear-gradient(90deg, #00d4ff, hsl(var(--primary)) 68%, #704cff)` |
| 16701 | `rgb(0 212 255 / 0.27), 0 0 15px rgb(139 44 255 / 0.1)` |
| 16705 | `linear-gradient(135deg, #00cbbf, hsl(var(--primary)))` |
| 16706 | `rgb(0 212 255 / 0.24), 0 0 15px hsl(var(--success) / 0.12)` |
| 16710 | `rgb(0 212 255 / 0.13), 0 0 12px rgb(0 212 255 / 0.34), 0 0 22px rgb(139 44 255 / 0.14)` |
| 16719 | `rgb(0 174 230 / 0.24)` |
| 16720 | `rgb(0 150 255 / 0.055), inset 0 1px 0 rgb(255 255 255 / 0.035)` |
| 16727 | `rgb(0 212 255 / 0.12), 0 0 24px rgb(139 44 255 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.045)` |
| 16736 | `#35dcff` |
| 16737 | `rgb(0 174 230 / 0.1)` |
| 16738 | `rgb(0 212 255 / 0.22), 0 0 18px rgb(139 44 255 / 0.08)` |
| 16743 | `linear-gradient(115deg, #00d4ff 0%, hsl(var(--primary)) 46%, #8b2cff 100%)` |
| 16744 | `rgb(0 212 255 / 0.22), 0 0 28px rgb(139 44 255 / 0.15), 0 7px 18px hsl(var(--primary) / 0.24)` |
| 16748 | `rgb(0 212 255 / 0.28), 0 0 34px rgb(139 44 255 / 0.2), 0 9px 22px hsl(var(--primary) / 0.3)` |
| 16752 | `rgb(57 133 255 / 0.3)` |
| 16753 | `hsl(var(--secondary) / 0.7)` |
| 16754 | `rgb(8 123 255 / 0.08), 0 0 18px rgb(139 44 255 / 0.055)` |
| 16759 | `rgb(0 212 255 / 0.13), 0 0 22px rgb(139 44 255 / 0.09)` |
| 16764 | `rgb(0 174 255 / 0.18))` |
| 17078, 17678, 17698 | `radial-gradient(circle at 0 0, rgba(0, 198, 255, 0.11), transparent 34%)` |
| 17079, 17679, 17699 | `radial-gradient(circle at 100% 100%, rgba(139, 38, 255, 0.13), transparent 36%)` |
| 17080, 17680, 17700 | `linear-gradient(145deg, #07152f 0%, #040b1c 52%, #080722 100%)` |
| 17081, 17681, 17701 | `rgba(39, 138, 255, 0.62)` |
| 17083, 17683, 17703 | `rgba(24, 120, 255, 0.08)` |
| 17084, 17684, 17704 | `rgba(104, 35, 255, 0.14)` |
| 17085, 17685, 23543 | `rgba(0, 0, 0, 0.58)` |
| 17098 | `linear-gradient(118deg, transparent 18%, rgba(0, 202, 255, 0.04) 45%, transparent 70%)` |
| 17099 | `linear-gradient(90deg, transparent 0 86px, rgba(255, 255, 255, 0.012) 87px)` |
| 17118 | `rgba(3, 13, 38, 0.74)` |
| 17119 | `rgba(71, 117, 194, 0.22)` |
| 17140 | `linear-gradient(105deg, #13d8ef 0%, #137bff 54%, #b51fff 100%)` |
| 17142 | `rgba(46, 89, 255, 0.34)` |
| 17146 | `rgba(5, 22, 55, 0.8)` |
| 17147 | `rgba(42, 117, 255, 0.46)` |
| 17148 | `#b8cbf1` |
| 17155 | `rgba(25, 104, 255, 0.09)` |
| 17160 | `rgba(45, 213, 255, 0.72)` |
| 17162 | `rgba(8, 32, 76, 0.94)` |
| 17182 | `linear-gradient(90deg, #1ddff3, #158dff)` |
| 17194 | `#d7dbfa` |
| 17195 | `rgba(67, 20, 157, 0.15)` |
| 17198 | `rgba(124, 52, 255, 0.38)` |
| 17202 | `#b230ff` |
| 17208 | `#9caed4` |
| 17221 | `linear-gradient(125deg, rgba(11, 38, 79, 0.68), rgba(5, 17, 43, 0.72))` |
| 17222 | `rgba(4, 16, 42, 0.8)` |
| 17223 | `rgba(37, 121, 233, 0.52)` |
| 17229 | `rgba(17, 106, 238, 0.06)` |
| 17234 | `rgba(37, 211, 255, 0.78)` |
| 17235 | `rgba(17, 106, 238, 0.08), 0 0 0 3px rgba(17, 139, 255, 0.08)` |
| 17272 | `#8498c0` |
| 17281 | `rgba(93, 137, 200, 0.18)` |
| 17286 | `#9aabd0` |
| 17298 | `linear-gradient(145deg, #06152f, #100935)` |
| 17299 | `#7543ff` |
| 17307 | `rgba(4, 10, 30, 0.94), 0 0 20px rgba(92, 66, 255, 0.52)` |
| 17312 | `#21d5ff` |
| 17325 | `linear-gradient(100deg, rgba(13, 50, 92, 0.72), rgba(6, 19, 48, 0.72))` |
| 17326 | `rgba(35, 111, 217, 0.32)` |
| 17333, 17361 | `#00c6ff` |
| 17351, 17540 | `#9faed1` |
| 17370 | `#239eff` |
| 17427 | `rgba(39, 93, 255, 0.33)` |
| 17432 | `rgba(70, 70, 255, 0.42)` |
| 17436 | `linear-gradient(105deg, #17677f, #3d3477)` |
| 17454 | `#9aa9cb` |
| 17460 | `#258cff` |
| 17468 | `linear-gradient(135deg, rgba(13, 42, 85, 0.92), rgba(6, 20, 51, 0.96))` |
| 17469 | `rgba(35, 101, 200, 0.48)` |
| 17484 | `rgba(34, 214, 255, 0.78)` |
| 17485 | `rgba(10, 43, 86, 0.98)` |
| 17493 | `rgba(52, 104, 181, 0.28)` |
| 17494 | `rgba(3, 14, 38, 0.68)` |
| 17501 | `#94a9cf` |
| 17505 | `rgba(43, 188, 255, 0.42)` |
| 17506 | `rgba(17, 95, 164, 0.3)` |
| 17507 | `#35c8ff` |
| 17556 | `#22c8ff` |
| 17705 | `rgba(0, 0, 0, 0.34)` |
| 17827 | `rgba(4, 10, 30, 0.94), 0 0 17px rgba(92, 66, 255, 0.48)` |
| 17854, 17855 | `radial-gradient(circle 26px at 50% 100%, transparent 25px, #000 26px)` |
| 17859, 17860 | `radial-gradient(circle 26px at 50% 0%, transparent 25px, #000 26px)` |
| 18143 | `rgb(2 6 23 / 0.24)` |
| 18164 | `rgb(0 0 0 / 0.52)` |
| 18165, 24189 | `rgb(8 123 255 / 0.14)` |
| 19025 | `radial-gradient(circle at 50% 0%, rgb(36 72 255 / 0.16), transparent 62%)` |
| 19032 | `rgb(130 164 224 / 0.28)` |
| 19033 | `rgb(10 30 67 / 0.78)` |
| 19034 | `#c9d7f4` |
| 19497 | `rgba(1, 4, 13, 0.7)` |
| 19522 | `radial-gradient(circle at 0 0, rgba(23, 138, 255, 0.13), transparent 35%)` |
| 19523 | `linear-gradient(155deg, #071225 0%, #060a17 58%, #0c0820 100%)` |
| 19524 | `rgba(63, 133, 232, 0.35)` |
| 19525 | `rgba(0, 0, 0, 0.58), 4px 0 24px rgba(63, 75, 255, 0.13)` |
| 19548 | `rgba(113, 143, 195, 0.15)` |
| 19571 | `rgba(91, 124, 184, 0.22)` |
| 19573 | `#c6d2e7` |
| 19574, 19621, 21652 | `rgba(255, 255, 255, 0.045)` |
| 19581 | `rgba(63, 170, 255, 0.5)` |
| 19582 | `rgba(40, 101, 202, 0.15)` |
| 19599 | `#dbe5f5` |
| 19605 | `rgba(45, 91, 166, 0.12)` |
| 19611 | `rgba(54, 147, 255, 0.24)` |
| 19612 | `linear-gradient(105deg, rgba(27, 134, 234, 0.24), rgba(52, 71, 181, 0.18) 58%, rgba(133, 41, 219, 0.12))` |
| 19613 | `#22bfe8` |
| 19620 | `#9ab3d9` |
| 19625 | `#35ceff` |
| 19626 | `rgba(39, 164, 255, 0.14)` |
| 19631 | `rgba(67, 137, 255, 0.32)` |
| 19633 | `linear-gradient(105deg, rgba(7, 31, 63, 0.96), rgba(12, 28, 67, 0.96) 54%, rgba(35, 19, 76, 0.94))` |
| 19635 | `rgba(25, 128, 235, 0.08)` |
| 19636, 19703 | `rgba(36, 72, 255, 0.1)` |
| 19637, 21951 | `rgba(122, 44, 255, 0.08)` |
| 19642 | `rgba(92, 166, 255, 0.72)` |
| 19644 | `linear-gradient(105deg, rgba(13, 66, 128, 0.9), rgba(30, 54, 139, 0.88) 54%, rgba(79, 29, 142, 0.86))` |
| 19647 | `rgba(37, 99, 235, 0.16)` |
| 19648, 23471 | `rgba(37, 99, 235, 0.2)` |
| 19649 | `rgba(124, 58, 237, 0.18)` |
| 19653 | `#b9a8ff` |
| 19654 | `rgba(122, 44, 255, 0.16)` |
| 19671 | `#72dcff` |
| 19672 | `rgba(8, 123, 255, 0.16)` |
| 19673 | `rgba(19, 221, 244, 0.22)` |
| 19678, 22091 | `rgba(19, 221, 244, 0.2)` |
| 19690 | `rgba(18, 27, 48, 0.46)` |
| 19695 | `#17223a` |
| 19697 | `radial-gradient(circle at 0 0, rgba(19, 221, 244, 0.09), transparent 34%)` |
| 19698 | `radial-gradient(circle at 100% 72%, rgba(122, 44, 255, 0.065), transparent 42%)` |
| 19699 | `linear-gradient(155deg, #ffffff 0%, #f8fbff 56%, #f5f3ff 100%)` |
| 19702 | `rgba(27, 43, 78, 0.2)` |
| 19707 | `rgba(36, 72, 255, 0.12)` |
| 19711 | `rgba(36, 72, 255, 0.12))` |
| 19715 | `#273754` |
| 19716 | `rgba(238, 244, 255, 0.92)` |
| 19717 | `rgba(36, 72, 255, 0.16)` |
| 19718 | `rgba(37, 68, 126, 0.08)` |
| 19722, 19754 | `#087bff` |
| 19723 | `rgba(8, 123, 255, 0.35)` |
| 19725 | `rgba(8, 123, 255, 0.13)` |
| 19729, 19760, 22833 | `#27334d` |
| 19733, 19744, 19769, 19785 | `#111b31` |
| 19734 | `rgba(8, 123, 255, 0.055)` |
| 19738 | `#536b91` |
| 19739 | `linear-gradient(145deg, #f1f6fd, #e8effa)` |
| 19740 | `rgba(61, 96, 150, 0.055)` |
| 19745 | `rgba(36, 72, 255, 0.24)` |
| 19747 | `linear-gradient(105deg, rgba(19, 221, 244, 0.12), rgba(8, 123, 255, 0.1) 42%, rgba(122, 44, 255, 0.11))` |
| 19749, 19774, 19790, 22845 | `#13ddf4` |
| 19750, 21792, 21855, 22162 | `rgba(122, 44, 255, 0.1)` |
| 19755 | `linear-gradient(145deg, rgba(19, 221, 244, 0.16), rgba(36, 72, 255, 0.12), rgba(122, 44, 255, 0.13))` |
| 19756, 21950 | `rgba(8, 123, 255, 0.12)` |
| 19761 | `rgba(36, 114, 255, 0.2)` |
| 19762 | `linear-gradient(105deg, rgba(19, 221, 244, 0.08), rgba(8, 123, 255, 0.075) 56%, rgba(122, 44, 255, 0.065))` |
| 19764 | `rgba(19, 221, 244, 0.045)` |
| 19765 | `rgba(36, 114, 255, 0.065)` |
| 19770 | `rgba(52, 111, 255, 0.48)` |
| 19772 | `linear-gradient(105deg, rgba(19, 221, 244, 0.14), rgba(8, 123, 255, 0.13) 48%, rgba(122, 44, 255, 0.14))` |
| 19775 | `rgba(36, 114, 255, 0.13)` |
| 19776 | `rgba(122, 44, 255, 0.11)` |
| 19780 | `#6541d8` |
| 19781 | `linear-gradient(145deg, rgba(8, 123, 255, 0.1), rgba(122, 44, 255, 0.12))` |
| 19786 | `rgba(52, 111, 255, 0.52)` |
| 19788 | `linear-gradient(105deg, rgba(19, 221, 244, 0.15), rgba(8, 123, 255, 0.14) 42%, rgba(122, 44, 255, 0.15))` |
| 19791 | `rgba(36, 114, 255, 0.14)` |
| 19792 | `rgba(122, 44, 255, 0.12)` |
| 19826 | `#090a0f` |
| 19845 | `radial-gradient(circle at 14% 8%, rgb(0 208 255 / 0.13), transparent 27rem)` |
| 19846 | `radial-gradient(circle at 88% 26%, rgb(126 62 255 / 0.14), transparent 31rem)` |
| 19847 | `linear-gradient(145deg, #020817 0%, #05102b 48%, #090827 100%)` |
| 19857 | `linear-gradient(rgb(78 172 255 / 0.08) 1px, transparent 1px)` |
| 19858 | `linear-gradient(90deg, rgb(78 172 255 / 0.08) 1px, transparent 1px)` |
| 19860 | `linear-gradient(to bottom, black, transparent 76%)` |
| 19867 | `rgb(255 255 255 / 0.04)` |
| 19868 | `rgb(0 0 0 / 0.26)` |
| 19873 | `rgb(54 190 255 / 0.24)` |
| 19875 | `linear-gradient(145deg, rgb(13 31 72 / 0.94), rgb(7 17 46 / 0.96))` |
| 20002 | `rgb(0 215 255 / 0.42)` |
| 20003 | `rgb(0 199 255 / 0.11)` |
| 20004 | `#36dcff` |
| 20005 | `rgb(0 199 255 / 0.2)` |
| 20009 | `rgb(44 225 160 / 0.42)` |
| 20010 | `rgb(44 225 160 / 0.11)` |
| 20011 | `#54e5b1` |
| 20012 | `rgb(44 225 160 / 0.2)` |
| 20016 | `rgb(255 191 67 / 0.42)` |
| 20017 | `rgb(255 191 67 / 0.11)` |
| 20018 | `#ffc760` |
| 20019 | `rgb(255 191 67 / 0.18)` |
| 20023 | `rgb(255 91 113 / 0.42)` |
| 20024 | `rgb(255 91 113 / 0.11)` |
| 20025 | `#ff7288` |
| 20026 | `rgb(255 91 113 / 0.18)` |
| 20034 | `rgb(110 215 255 / 0.38)` |
| 20035 | `linear-gradient(100deg, #08c8f8, #1979ff 54%, #7b3cff)` |
| 20037 | `rgb(47 104 255 / 0.24)` |
| 20042 | `rgb(62 111 255 / 0.34)` |
| 20046 | `rgb(121 160 229 / 0.24)` |
| 20047 | `#eef4ff` |
| 20089, 20090 | `linear-gradient(90deg, transparent, #000 32px, #000 calc(100% - 32px), transparent)` |
| 20145 | `rgba(0,0,0,0.02), inset 0 0 0 1px rgba(255,255,255,0.05)` |
| 20151 | `rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.08)` |
| 20156 | `rgba(0,0,0,0.05), inset 0 0 0 1px rgba(255,255,255,0.1), 0 0 12px hsl(var(--primary) / 0.1)` |
| 20161 | `rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1), 0 0 12px hsl(var(--primary) / 0.15)` |
| 20316 | `linear-gradient(145deg, #ffffff 0%, #f8fafc 100%) padding-box, var(--widget-brand-gradient)` |
| 20317 | `rgba(25, 68, 128, 0.11), 0 0 24px rgba(36, 72, 255, 0.065), 0 0 38px rgba(19, 221, 244, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.94)` |
| 20333, 20350, 20378, 20473, 20490, 20566, 20607 | `#f1f5f9` |
| 20334, 20351, 20369, 20392, 20419, 20428, 20452, 20491, 20579 | `#e2e8f0` |
| 20357 | `rgba(36, 72, 255, 0.18)` |
| 20358 | `linear-gradient(112deg, rgba(19, 221, 244, 0.08), rgba(36, 72, 255, 0.07), rgba(122, 44, 255, 0.08))` |
| 20359, 20485, 23666, 23675, 23784, 23793 | `#334155` |
| 20363, 20382, 20393, 20397, 20405, 20436, 20465, 20513, 20518, 20529, 20550, 20573, 20583, 20596, 20612, 23683 | `#0f172a` |
| 20370 | `rgba(15, 23, 42, 0.04)` |
| 20386, 20629 | `#94a3b8` |
| 20391, 20585, 23687, 23691 | `#f8fafc` |
| 20413 | `rgba(36, 72, 255, 0.25)` |
| 20474 | `#3b82f6` |
| 20483, 20606, 23650, 23671, 23679, 23692, 23745, 23757, 23789, 23802, 23812 | `#cbd5e1` |
| 20531 | `linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)` |
| 20532 | `linear-gradient(125deg, rgb(19 221 244 / 0.5), rgb(36 72 255 / 0.42), rgb(122 44 255 / 0.46))` |
| 20535 | `rgb(15 23 42 / 0.16)` |
| 20565, 20584 | `#dbe3ed` |
| 20574 | `rgb(8 123 255 / 0.34)` |
| 20586 | `rgb(15 23 42 / 0.04)` |
| 20590, 24205 | `rgb(8 123 255 / 0.42)` |
| 20605, 23753 | `#475569` |
| 20613 | `rgb(8 123 255 / 0.3)` |
| 20625 | `rgb(8 123 255 / 0.06)` |
| 20688, 20872 | `hsl(202 92% 61% / 0.28)` |
| 20691 | `radial-gradient(circle at 10% 0%, hsl(187 92% 54% / 0.1), transparent 42%)` |
| 20692 | `radial-gradient(circle at 90% 100%, hsl(271 92% 62% / 0.1), transparent 44%)` |
| 20695 | `hsl(222 66% 24% / 0.08)` |
| 20712 | `hsl(var(--background) / 0.78)` |
| 20716 | `hsl(222 50% 20% / 0.08)` |
| 20721 | `hsl(var(--primary) / 0.48)` |
| 20851 | `hsl(var(--primary) / 0.045)` |
| 20875, 23014 | `hsl(var(--card) / 0.92)` |
| 20967 | `hsl(357 86% 56%)` |
| 20993 | `hsl(218 20% 54%)` |
| 21010 | `hsl(202 66% 68% / 0.34)` |
| 21016 | `hsl(222 50% 18% / 0.045)` |
| 21056 | `hsl(var(--muted) / 0.34)` |
| 21084 | `hsl(230 92% 57% / 0.25)` |
| 21107 | `rgb(116 183 226 / 0.42)` |
| 21108 | `rgb(250 253 255 / 0.96)` |
| 21113 | `rgb(152 191 221 / 0.56)` |
| 21115, 21671, 21829 | `#172033` |
| 21250 | `radial-gradient(circle at 30% 0%, hsl(191 100% 55% / 0.09), transparent 42%)` |
| 21251 | `radial-gradient(circle at 72% 100%, hsl(268 90% 64% / 0.08), transparent 46%)` |
| 21254 | `hsl(227 75% 34% / 0.07)` |
| 21554 | `#05060A` |
| 21567 | `radial-gradient(ellipse at top, rgba(37,99,235,0.08) 0%, transparent 70%)` |
| 21596 | `radial-gradient(circle at 78% 8%, rgba(122, 44, 255, 0.13), transparent 30%)` |
| 21597 | `radial-gradient(circle at 12% 48%, rgba(19, 221, 244, 0.055), transparent 34%)` |
| 21598 | `linear-gradient(180deg, #0a0e1b 0%, #070b16 55%, #090d19 100%)` |
| 21599 | `rgba(36, 72, 255, 0.35)` |
| 21600 | `rgba(8, 123, 255, 0.1), inset 1px 0 rgba(19, 221, 244, 0.12)` |
| 21608 | `linear-gradient(180deg, rgba(19, 221, 244, 0.025), transparent 18%, transparent 78%, rgba(122, 44, 255, 0.055))` |
| 21615 | `radial-gradient(circle at 78% 8%, rgba(122, 44, 255, 0.055), transparent 30%)` |
| 21616 | `radial-gradient(circle at 12% 48%, rgba(19, 221, 244, 0.045), transparent 34%)` |
| 21617 | `linear-gradient(180deg, #ffffff 0%, #f8faff 55%, #f4f7ff 100%)` |
| 21618, 22220 | `rgba(36, 72, 255, 0.22)` |
| 21619 | `rgba(15, 23, 42, 0.12), inset 1px 0 rgba(19, 221, 244, 0.12)` |
| 21627 | `linear-gradient(180deg, rgba(19, 221, 244, 0.025), transparent 18%, transparent 78%, rgba(122, 44, 255, 0.035))` |
| 21641 | `linear-gradient(145deg, rgba(18, 24, 43, 0.97), rgba(9, 13, 27, 0.98))` |
| 21642 | `linear-gradient(115deg, rgba(19, 221, 244, 0.42), rgba(8, 123, 255, 0.48) 36%, rgba(36, 72, 255, 0.52) 68%, rgba(122, 44, 255, 0.48))` |
| 21644 | `rgba(8, 123, 255, 0.045)` |
| 21645 | `rgba(255, 255, 255, 0.035)` |
| 21646 | `rgba(8, 123, 255, 0.1)` |
| 21647 | `rgba(122, 44, 255, 0.055)` |
| 21651 | `rgba(8, 123, 255, 0.075)` |
| 21653 | `rgba(19, 221, 244, 0.13)` |
| 21654 | `rgba(122, 44, 255, 0.09)` |
| 21660 | `linear-gradient(145deg, rgba(255, 255, 255, 0.99), rgba(247, 249, 255, 0.99))` |
| 21661 | `linear-gradient(115deg, rgba(19, 180, 210, 0.34), rgba(8, 123, 255, 0.35) 36%, rgba(36, 72, 255, 0.38) 68%, rgba(122, 44, 255, 0.34))` |
| 21663 | `rgba(8, 123, 255, 0.025)` |
| 21665 | `rgba(15, 23, 42, 0.055)` |
| 21668 | `#f5f8ff` |
| 21669 | `rgba(218, 228, 255, 0.52)` |
| 21672, 21832 | `#526176` |
| 21701, 21814 | `rgba(59, 130, 246, 0.15)` |
| 21702, 21814 | `#60a5fa` |
| 21703 | `rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(8, 123, 255, 0.2), 0 0 18px rgba(8, 123, 255, 0.12)` |
| 21706 | `rgba(37, 99, 235, 0.09)` |
| 21708 | `rgba(37, 99, 235, 0.18), inset 0 0 16px rgba(8, 123, 255, 0.08)` |
| 21710, 21815 | `rgba(34, 197, 94, 0.15)` |
| 21710, 21796 | `#22c55e` |
| 21710 | `rgba(34, 197, 94, 0.3), inset 0 0 20px rgba(34, 197, 94, 0.2)` |
| 21711, 21816 | `rgba(239, 68, 68, 0.15)` |
| 21711 | `#ef4444` |
| 21711 | `rgba(239, 68, 68, 0.3), inset 0 0 20px rgba(239, 68, 68, 0.2)` |
| 21712, 21817 | `rgba(245, 158, 11, 0.15)` |
| 21712, 22187 | `#f59e0b` |
| 21712 | `rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(245, 158, 11, 0.2)` |
| 21714, 21797, 21824 | `rgba(34, 197, 94, 0.1)` |
| 21714, 21824 | `#16a34a` |
| 21714, 21824 | `rgba(34, 197, 94, 0.2)` |
| 21715, 21825 | `rgba(239, 68, 68, 0.1)` |
| 21715, 21825 | `#dc2626` |
| 21715, 21825 | `rgba(239, 68, 68, 0.2)` |
| 21716, 21826, 22182 | `rgba(245, 158, 11, 0.1)` |
| 21716, 21826 | `#d97706` |
| 21716, 21826, 22183 | `rgba(245, 158, 11, 0.2)` |
| 21733 | `rgba(19, 221, 244, 0.1)` |
| 21734 | `#111827` |
| 21814 | `rgba(59, 130, 246, 0.3)` |
| 21815, 23741 | `#4ade80` |
| 21815 | `rgba(34, 197, 94, 0.3)` |
| 21816 | `#f87171` |
| 21816 | `rgba(239, 68, 68, 0.3)` |
| 21817 | `#fbbf24` |
| 21817 | `rgba(245, 158, 11, 0.3)` |
| 21818 | `rgba(59, 130, 246, 0.18)` |
| 21819 | `rgba(34, 197, 94, 0.18)` |
| 21820 | `rgba(239, 68, 68, 0.16)` |
| 21821 | `rgba(245, 158, 11, 0.16)` |
| 21823 | `rgba(59, 130, 246, 0.1)` |
| 21823 | `rgba(59, 130, 246, 0.2)` |
| 21851, 21895, 22134, 22164, 22170, 22327 | `rgba(122, 44, 255, 0.2)` |
| 21864 | `linear-gradient(90deg, #13DDF4, #087BFF, #7A2CFF)` |
| 21868, 21902 | `rgba(8, 123, 255, 0.4)` |
| 21885 | `rgba(10, 14, 27, 1)` |
| 21886 | `rgba(122, 44, 255, 0.3)` |
| 21899, 21900, 22038, 22042 | `#087BFF` |
| 21906, 21907, 22121, 23053 | `#13DDF4` |
| 21908 | `#000` |
| 21909 | `rgba(19, 221, 244, 0.6)` |
| 21946 | `linear-gradient(#090d1a, #090d1a)` |
| 21947 | `linear-gradient(115deg, rgba(19, 221, 244, 0.58), rgba(8, 123, 255, 0.58) 34%, rgba(36, 72, 255, 0.64) 67%, rgba(122, 44, 255, 0.62))` |
| 21949 | `rgba(36, 72, 255, 0.06)` |
| 21955 | `linear-gradient(145deg, rgba(7, 27, 32, 0.94), rgba(8, 17, 28, 0.98))` |
| 21956 | `linear-gradient(120deg, rgba(19, 221, 244, 0.66), rgba(26, 209, 146, 0.42), rgba(8, 123, 255, 0.42))` |
| 21957 | `rgba(19, 221, 244, 0.055), 0 0 9px rgba(19, 221, 244, 0.12), 0 0 18px rgba(26, 209, 146, 0.06)` |
| 21962 | `linear-gradient(#ffffff, #f8faff)` |
| 21963 | `linear-gradient(115deg, rgba(19, 180, 210, 0.46), rgba(8, 123, 255, 0.46) 34%, rgba(36, 72, 255, 0.5) 67%, rgba(122, 44, 255, 0.48))` |
| 21964 | `rgba(36, 72, 255, 0.035), 0 8px 24px rgba(15, 23, 42, 0.07)` |
| 21968 | `linear-gradient(145deg, #f4fffe, #f8fcff)` |
| 21969 | `linear-gradient(120deg, rgba(19, 190, 205, 0.52), rgba(26, 170, 125, 0.35), rgba(8, 123, 255, 0.34))` |
| 21970 | `rgba(19, 221, 244, 0.035), 0 6px 16px rgba(15, 23, 42, 0.045)` |
| 22051, 22142 | `rgba(122, 44, 255, 0.15)` |
| 22071 | `#7A2CFF` |
| 22074, 22174, 22248 | `#10B981` |
| 22096 | `rgba(19, 221, 244, 0.3)` |
| 22123 | `#08778b` |
| 22141 | `rgba(255,255,255,0.8)` |
| 22145 | `rgba(122, 44, 255, 0.4)` |
| 22218 | `linear-gradient(110deg, #13DDF4 0%, #087BFF 36%, #2448FF 66%, #7A2CFF 100%)` |
| 22224 | `rgba(122, 44, 255, 0.28)` |
| 22234, 22242 | `rgba(255,255,255,0.1)` |
| 22245 | `rgba(0,0,0,0.06)` |
| 22249 | `rgba(16, 185, 129, 0.3)` |
| 22466 | `linear-gradient(105deg, rgb(34 211 238 / 8%), rgb(37 99 235 / 10%) 52%, rgb(124 58 237 / 9%))` |
| 22494 | `rgba(0, 0, 0, 0.15)` |
| 22511, 23556 | `rgba(37, 99, 235, 0.12)` |
| 22512 | `rgba(124, 58, 237, 0.09)` |
| 22513 | `rgba(56, 189, 248, 0.18)` |
| 22514 | `rgba(7, 20, 38, 0.97)` |
| 22559 | `linear-gradient(120deg, rgba(6, 182, 212, 0.08), rgba(59, 130, 246, 0.08), rgba(168, 85, 247, 0.08))` |
| 22566 | `linear-gradient(120deg, rgba(6, 182, 212, 0.12), rgba(59, 130, 246, 0.12), rgba(168, 85, 247, 0.12))` |
| 22572 | `linear-gradient(120deg, rgb(34 211 238 / 9%), rgb(37 99 235 / 10%), rgb(124 58 237 / 9%))` |
| 22573 | `rgb(59 130 246 / 34%)` |
| 22607 | `linear-gradient(135deg, #06b6d4, #3b82f6, #a855f7)` |
| 22609 | `rgba(59, 130, 246, 0.25)` |
| 22678 | `hsl(var(--card)/0.5)` |
| 22701 | `hsl(var(--muted)/0.3)` |
| 22717 | `hsl(var(--muted)/0.15)` |
| 22737 | `hsl(var(--border)/0.3)` |
| 22753 | `hsl(var(--muted)/0.6)` |
| 22814 | `rgb(59 130 246 / 32%)` |
| 22816 | `linear-gradient(105deg, rgb(7 31 63 / 96%), rgb(12 28 67 / 96%) 54%, rgb(35 19 76 / 94%))` |
| 22824 | `rgb(92 166 255 / 72%)` |
| 22825 | `linear-gradient(105deg, rgb(13 66 128 / 90%), rgb(30 54 139 / 88%) 54%, rgb(79 29 142 / 86%))` |
| 22834 | `rgb(36 114 255 / 20%)` |
| 22835 | `linear-gradient(105deg, rgb(19 221 244 / 8%), rgb(8 123 255 / 7.5%) 56%, rgb(122 44 255 / 6.5%))` |
| 22837 | `rgb(19 221 244 / 4.5%)` |
| 22838 | `rgb(36 114 255 / 6.5%)` |
| 22842 | `rgb(52 111 255 / 50%)` |
| 22843 | `linear-gradient(105deg, rgb(19 221 244 / 15%), rgb(8 123 255 / 14%) 48%, rgb(122 44 255 / 15%))` |
| 22846 | `rgb(36 114 255 / 14%)` |
| 22847 | `rgb(122 44 255 / 12%)` |
| 22856 | `radial-gradient(circle at 0 0, hsl(var(--primary) / .08), transparent 38%)` |
| 22857 | `linear-gradient(155deg, hsl(var(--background)), hsl(var(--card)))` |
| 22859 | `hsl(220 35% 35% / .18)` |
| 22860, 22876 | `hsl(var(--primary) / .08)` |
| 22868 | `hsl(var(--primary) / .3)` |
| 22870 | `hsl(var(--background) / .88)` |
| 22874 | `hsl(var(--primary) / .58)` |
| 22880 | `hsl(220 28% 18% / .34)` |
| 22885 | `hsl(var(--card) / .86)` |
| 23012 | `radial-gradient(circle at 0 0, rgb(19 221 244 / 5%), transparent 42%)` |
| 23013 | `radial-gradient(circle at 100% 100%, rgb(122 44 255 / 4%), transparent 42%)` |
| 23021 | `radial-gradient(circle at 0 0, rgba(19, 221, 244, 0.04), transparent 60%)` |
| 23022 | `radial-gradient(circle at 100% 100%, rgba(122, 44, 255, 0.03), transparent 50%)` |
| 23027 | `#0B101B` |
| 23032 | `rgb(117 151 212 / 16%)` |
| 23034 | `radial-gradient(circle at 0 0, rgb(19 221 244 / 10%), transparent 44%)` |
| 23035 | `radial-gradient(circle at 100% 100%, rgb(122 44 255 / 10%), transparent 44%)` |
| 23036 | `#0b101b` |
| 23040 | `radial-gradient(circle at -20% -20%, rgba(19, 221, 244, 0.15), transparent 60%)` |
| 23041 | `radial-gradient(circle at 120% 120%, rgba(122, 44, 255, 0.12), transparent 60%)` |
| 23052 | `linear-gradient(135deg, rgba(19, 221, 244, 0.1), rgba(122, 44, 255, 0.1))` |
| 23054 | `rgba(19, 221, 244, 0.15)` |
| 23058 | `linear-gradient(135deg, rgba(19, 221, 244, 0.15), rgba(122, 44, 255, 0.15))` |
| 23059 | `rgba(19, 221, 244, 0.25)` |
| 23069 | `rgb(34 151 255 / 38%)` |
| 23128 | `radial-gradient(circle at 15% 0%, rgb(23 189 255 / 0.16), transparent 38%)` |
| 23129 | `linear-gradient(100deg, rgb(16 45 94 / 0.98), rgb(39 25 91 / 0.98))` |
| 23130 | `rgb(101 151 255 / 0.32)` |
| 23132 | `rgb(30 66 180 / 0.18), inset 0 1px rgb(255 255 255 / 0.06)` |
| 23138 | `rgb(115 159 255 / 0.38)` |
| 23139 | `rgb(2 8 28 / 0.42), 0 0 20px rgb(67 82 255 / 0.1), inset 0 1px rgb(255 255 255 / 0.07)` |
| 23145 | `rgb(86 226 255)` |
| 23146 | `rgb(45 205 255 / 0.28)` |
| 23154 | `rgb(151 180 232 / 0.3)` |
| 23178 | `rgb(255 120 90)` |
| 23179 | `rgb(255 91 61 / 0.3)` |
| 23182 | `rgb(255 154 112)` |
| 23183 | `rgb(255 86 54 / 0.12)` |
| 23184 | `rgb(255 76 45 / 0.12)` |
| 23224 | `hsl(var(--destructive)/0.3)` |
| 23225 | `hsl(var(--destructive)/0.15)` |
| 23346 | `rgb(59 130 246 / 18%)` |
| 23348 | `rgb(255 255 255 / 60%)` |
| 23349, 23367 | `rgb(37 99 235 / 55%)` |
| 23364 | `rgb(96 165 250 / 20%)` |
| 23445 | `rgba(37, 99, 235, 0.14)` |
| 23446 | `rgba(124, 58, 237, 0.13)` |
| 23447 | `rgba(34, 211, 238, 0.09)` |
| 23458 | `linear-gradient(115deg, #22d3ee, #3b82f6, #8b5cf6, #22d3ee)` |
| 23462, 23463, 23499, 23500, 23503, 23504, 23526, 23527, 23530, 23531 | `linear-gradient(#fff 0 0)` |
| 23472, 23515 | `rgba(124, 58, 237, 0.2)` |
| 23473, 23912 | `rgba(34, 211, 238, 0.12)` |
| 23495 | `linear-gradient(135deg, rgba(34, 211, 238, 0.9), rgba(59, 130, 246, 0.85), rgba(139, 92, 246, 0.95))` |
| 23514 | `rgba(37, 99, 235, 0.24)` |
| 23516 | `rgba(103, 232, 249, 0.18)` |
| 23524 | `linear-gradient(135deg, rgba(34, 211, 238, 0.7), rgba(59, 130, 246, 0.66), rgba(139, 92, 246, 0.72))` |
| 23544 | `rgba(59, 130, 246, 0.32)` |
| 23545 | `rgba(124, 58, 237, 0.22)` |
| 23546 | `rgba(103, 232, 249, 0.22)` |
| 23557 | `rgba(124, 58, 237, 0.11)` |
| 23651 | `rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06)` |
| 23656 | `linear-gradient(145deg, rgba(15, 23, 48, 0.98), rgba(8, 13, 31, 0.98))` |
| 23657 | `rgba(96, 165, 250, 0.34)` |
| 23659 | `rgba(255, 255, 255, 0.04)` |
| 23660 | `rgba(2, 6, 23, 0.46)` |
| 23661 | `rgba(99, 102, 241, 0.09)` |
| 23696 | `rgba(30, 41, 79, 0.46)` |
| 23697, 23749 | `rgba(148, 163, 184, 0.3)` |
| 23702, 23724 | `#c2410c` |
| 23707, 23730 | `#fb923c` |
| 23711 | `rgba(249, 115, 22, 0.12)` |
| 23712, 23725 | `rgba(234, 88, 12, 0.42)` |
| 23713 | `rgba(249, 115, 22, 0.5)` |
| 23717 | `rgba(249, 115, 22, 0.15)` |
| 23718 | `rgba(251, 146, 60, 0.48)` |
| 23719 | `rgba(249, 115, 22, 0.6)` |
| 23723 | `rgba(249, 115, 22, 0.1)` |
| 23729 | `rgba(249, 115, 22, 0.14)` |
| 23731 | `rgba(251, 146, 60, 0.45)` |
| 23736 | `#15803d` |
| 23765 | `linear-gradient(125deg, rgba(6, 182, 212, 0.62), rgba(59, 130, 246, 0.58) 48%, rgba(124, 58, 237, 0.58))` |
| 23767 | `rgba(59, 130, 246, 0.045)` |
| 23768 | `rgba(37, 99, 235, 0.48)` |
| 23769 | `rgba(124, 58, 237, 0.42)` |
| 23774, 23897 | `linear-gradient(145deg, rgba(13, 20, 42, 0.98), rgba(8, 13, 30, 0.98))` |
| 23775 | `linear-gradient(125deg, rgba(34, 211, 238, 0.65), rgba(59, 130, 246, 0.62) 48%, rgba(139, 92, 246, 0.62))` |
| 23777 | `rgba(59, 130, 246, 0.07)` |
| 23778, 23901 | `rgba(37, 99, 235, 0.58)` |
| 23779, 23902 | `rgba(139, 92, 246, 0.5)` |
| 23797, 23913 | `#67e8f9` |
| 23801 | `rgba(248, 250, 252, 0.92)` |
| 23806 | `rgba(15, 23, 48, 0.78)` |
| 23807 | `rgba(96, 165, 250, 0.28)` |
| 23811 | `rgba(248, 250, 252, 0.88)` |
| 23816 | `rgba(15, 23, 42, 0.7)` |
| 23817 | `rgba(148, 163, 184, 0.28)` |
| 23829 | `rgba(34, 211, 238, 0.4)` |
| 23831 | `rgba(59, 130, 246, 0.08)` |
| 23832 | `rgba(6, 182, 212, 0.6)` |
| 23833 | `rgba(124, 58, 237, 0.5)` |
| 23888 | `linear-gradient(125deg, rgba(6, 182, 212, 0.6), rgba(59, 130, 246, 0.56) 50%, rgba(124, 58, 237, 0.56))` |
| 23890 | `rgba(59, 130, 246, 0.05)` |
| 23891 | `rgba(37, 99, 235, 0.52)` |
| 23892 | `rgba(124, 58, 237, 0.45)` |
| 23898 | `linear-gradient(125deg, rgba(34, 211, 238, 0.64), rgba(59, 130, 246, 0.62) 50%, rgba(139, 92, 246, 0.62))` |
| 23900 | `rgba(59, 130, 246, 0.075)` |
| 23906 | `rgba(14, 116, 144, 0.1)` |
| 23907 | `#164e63` |
| 23908 | `rgba(14, 116, 144, 0.35)` |
| 23914 | `rgba(103, 232, 249, 0.4)` |
| 23966 | `rgb(3 9 25 / 0.58)` |
| 23983 | `hsl(var(--primary) / 0.35)` |
| 23984 | `rgb(5 13 40 / 0.26)` |
| 24046 | `#7d450c` |
| 24047 | `#fff4db` |
| 24048 | `#d2a957` |
| 24051 | `#ffd58d` |
| 24052 | `#3d2d17` |
| 24053 | `#a57232` |
| 24099 | `radial-gradient(circle at 4% 0%, rgb(19 221 244 / 0.10), transparent 54%)` |
| 24100 | `radial-gradient(circle at 100% 100%, rgb(122 44 255 / 0.12), transparent 58%)` |
| 24101 | `linear-gradient(145deg, rgb(12 26 48 / 0.94), rgb(8 16 34 / 0.97))` |
| 24102 | `rgb(102 163 255 / 0.43)` |
| 24106 | `rgb(0 3 17 / 0.26)` |
| 24107 | `rgb(19 221 244 / 0.13)` |
| 24109 | `rgb(122 44 255 / 0.18)` |
| 24111 | `rgb(122 44 255 / 0.14)` |
| 24112 | `rgb(8 123 255 / 0.18)` |
| 24113 | `rgb(0 3 17 / 0.3)` |
| 24114 | `rgb(19 221 244 / 0.21)` |
| 24116 | `rgb(122 44 255 / 0.22)` |
| 24117 | `#77ceff` |
| 24119 | `radial-gradient(circle at 20% 10%, rgb(19 221 244 / 0.15), transparent 65%)` |
| 24120 | `linear-gradient(135deg, rgb(8 123 255 / 0.16), rgb(122 44 255 / 0.16))` |
| 24125 | `radial-gradient(circle at 3% 0%, rgb(19 221 244 / 0.09), transparent 54%)` |
| 24126 | `radial-gradient(circle at 100% 100%, rgb(122 44 255 / 0.08), transparent 56%)` |
| 24127 | `linear-gradient(145deg, rgb(255 255 255 / 0.97), rgb(246 249 255 / 0.96))` |
| 24128 | `rgb(53 126 242 / 0.35)` |
| 24130 | `rgb(122 44 255 / 0.055)` |
| 24131 | `rgb(8 123 255 / 0.10)` |
| 24132 | `rgb(34 85 175 / 0.09)` |
| 24135, 24190 | `rgb(122 44 255 / 0.11)` |
| 24137 | `rgb(122 44 255 / 0.10)` |
| 24138 | `rgb(8 123 255 / 0.16)` |
| 24139 | `rgb(34 85 175 / 0.13)` |
| 24140 | `rgb(255 255 255 / 0.96)` |
| 24142, 24216 | `rgb(122 44 255 / 0.15)` |
| 24143 | `#086dd8` |
| 24145 | `radial-gradient(circle at 20% 10%, rgb(19 221 244 / 0.13), transparent 65%)` |
| 24146 | `linear-gradient(135deg, rgb(8 123 255 / 0.10), rgb(122 44 255 / 0.09))` |
| 24166 | `rgb(96 181 255 / 0.63)` |
| 24176 | `rgb(48 131 244 / 0.50)` |
| 24186 | `rgb(92 159 255 / 0.29)` |
| 24201 | `rgb(8 123 255 / 0.42))` |
| 24213 | `rgb(96 181 255 / 0.46)` |
| 24215 | `rgb(8 123 255 / 0.22)` |
| 24348 | `hsl(var(--card) / 0.6)` |
| 24382, 24708 | `hsl(var(--card) / 0.7)` |
| 24556 | `hsl(var(--border) / 0.55)` |
| 24566 | `hsl(var(--border) / 0.72)` |
| 24568 | `hsl(var(--muted) / 0.32)` |
| 24750 | `linear-gradient(105deg, #16dbe9 0%, #118bff 50%, #9e35f5 100%)` |
| 24752 | `rgba(39, 93, 255, 0.28)` |
| 24756 | `linear-gradient(105deg, #40778e, #53527e)` |
| 24757 | `#e5eaf5` |
| 24815 | `linear-gradient(105deg, hsl(var(--primary) / 0.11), hsl(266 82% 60% / 0.08) 82%), hsl(var(--card))` |
| 24817 | `hsl(var(--foreground) / 0.06), 0 4px 14px -9px hsl(var(--primary) / 0.48)` |
| 24836 | `hsl(var(--primary) / 0.65)` |
| 24855 | `linear-gradient(110deg, hsl(var(--primary) / 0.1), hsl(268 80% 62% / 0.08)), hsl(var(--card))` |
| 24900 | `linear-gradient(105deg, hsl(var(--primary) / 0.07), hsl(268 80% 62% / 0.05)), hsl(var(--card))` |
| 24909 | `linear-gradient(105deg, hsl(var(--primary) / 0.055), hsl(268 80% 62% / 0.04)), hsl(var(--card))` |

**`artifacts/crypto-exchange-widget/src/network-drawer-redesign.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 6, 39, 226 | `hsl(var(--primary) / .24)` |
| 8 | `hsl(var(--background))` |
| 9 | `hsl(var(--foreground) / .2), 0 0 48px hsl(var(--primary) / .1)` |
| 15 | `linear-gradient(105deg, hsl(var(--card) / .98), hsl(var(--primary) / .07) 68%, hsl(267 72% 58% / .08))` |
| 41 | `linear-gradient(115deg, hsl(var(--card)), hsl(var(--primary) / .075) 58%, hsl(267 72% 58% / .085))` |
| 42 | `hsl(var(--primary) / .06)` |
| 48 | `linear-gradient(90deg, hsl(var(--primary)), hsl(267 72% 58%), transparent 92%)` |
| 61, 173, 188, 191, 258, 298 | `hsl(var(--primary))` |
| 76, 97, 116, 218 | `hsl(var(--muted-foreground))` |
| 92, 126, 134, 163, 176 | `hsl(var(--border))` |
| 94 | `hsl(var(--card) / .8)` |
| 103, 182 | `hsl(var(--foreground))` |
| 108 | `hsl(var(--success) / .26)` |
| 108 | `hsl(var(--success) / .06)` |
| 109, 280, 281 | `hsl(var(--success))` |
| 110 | `hsl(var(--warning) / .3)` |
| 110 | `hsl(var(--warning) / .07)` |
| 111 | `hsl(var(--warning))` |
| 112 | `hsl(var(--destructive) / .27)` |
| 112 | `hsl(var(--destructive) / .055)` |
| 113, 264, 285 | `hsl(var(--destructive))` |
| 128, 208, 228, 293 | `hsl(var(--card))` |
| 129 | `hsl(var(--foreground) / .035)` |
| 144 | `linear-gradient(110deg, hsl(var(--primary) / .065), hsl(267 72% 58% / .055))` |
| 152 | `hsl(var(--input) / .68)` |
| 155 | `hsl(var(--primary) / .5)` |
| 165 | `hsl(var(--muted) / .38)` |
| 170 | `hsl(var(--primary) / .35)` |
| 171 | `hsl(var(--primary) / .075)` |
| 178 | `hsl(var(--muted) / .25)` |
| 180 | `hsl(var(--muted) / .16)` |
| 199 | `hsl(var(--primary) / .25)` |
| 201 | `hsl(var(--primary) / .035)` |
| 214 | `hsl(var(--border) / .6)` |
| 257 | `hsl(var(--primary) / .28)` |
| 259, 298 | `hsl(var(--primary) / .07)` |
| 261 | `hsl(var(--primary) / .13)` |
| 263, 286 | `hsl(var(--destructive) / .3)` |
| 265 | `hsl(var(--destructive) / .08)` |
| 267 | `hsl(var(--destructive) / .15)` |
| 271 | `hsl(var(--primary-foreground))` |
| 272 | `hsl(var(--primary) / .36)` |
| 273 | `linear-gradient(110deg, hsl(var(--primary)), hsl(262 72% 53%))` |
| 274 | `hsl(var(--primary) / .17)` |
| 278 | `hsl(var(--primary) / .26)` |
| 282 | `hsl(var(--success) / .16)` |
| 287 | `hsl(var(--destructive) / .07)` |
| 298 | `hsl(var(--primary) / .3)` |
| 335, 339 | `#fff` |
| 336 | `rgba(125, 225, 255, .42)` |
| 337 | `linear-gradient(105deg, #05cde8 0%, #187dff 49%, #8251ef 100%)` |
| 341 | `rgba(28, 105, 255, .2), 0 0 16px rgba(109, 70, 255, .12)` |
| 344 | `linear-gradient(105deg, #04bcd9 0%, #146fed 49%, #7445df 100%)` |
| 345 | `rgba(28, 105, 255, .24), 0 0 18px rgba(109, 70, 255, .15)` |

**`artifacts/crypto-exchange-widget/src/order-confirmation.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 26 | `radial-gradient(circle at 78% 8%, rgba(122, 44, 255, 0.13), transparent 30%)` |
| 27 | `radial-gradient(circle at 12% 48%, rgba(19, 221, 244, 0.055), transparent 34%)` |
| 28 | `linear-gradient(180deg, #0a0e1b 0%, #070b16 55%, #090d19 100%)` |
| 29 | `rgba(36, 72, 255, 0.35)` |
| 30 | `rgba(8, 123, 255, 0.1), inset 1px 0 rgba(19, 221, 244, 0.12)` |
| 38 | `linear-gradient(180deg, rgba(19, 221, 244, 0.025), transparent 18%, transparent 78%, rgba(122, 44, 255, 0.055))` |
| 45 | `radial-gradient(circle at 78% 8%, rgba(122, 44, 255, 0.055), transparent 30%)` |
| 46 | `radial-gradient(circle at 12% 48%, rgba(19, 221, 244, 0.045), transparent 34%)` |
| 47 | `linear-gradient(180deg, #ffffff 0%, #f8faff 55%, #f4f7ff 100%)` |
| 48, 610 | `rgba(36, 72, 255, 0.22)` |
| 49 | `rgba(15, 23, 42, 0.12), inset 1px 0 rgba(19, 221, 244, 0.12)` |
| 57 | `linear-gradient(180deg, rgba(19, 221, 244, 0.025), transparent 18%, transparent 78%, rgba(122, 44, 255, 0.035))` |
| 71 | `linear-gradient(145deg, rgba(18, 24, 43, 0.97), rgba(9, 13, 27, 0.98))` |
| 72 | `linear-gradient(115deg, rgba(19, 221, 244, 0.42), rgba(8, 123, 255, 0.48) 36%, rgba(36, 72, 255, 0.52) 68%, rgba(122, 44, 255, 0.48))` |
| 74 | `rgba(8, 123, 255, 0.045)` |
| 75 | `rgba(255, 255, 255, 0.035)` |
| 76 | `rgba(8, 123, 255, 0.1)` |
| 77 | `rgba(122, 44, 255, 0.055)` |
| 81 | `rgba(8, 123, 255, 0.075)` |
| 82 | `rgba(255, 255, 255, 0.045)` |
| 83 | `rgba(19, 221, 244, 0.13)` |
| 84 | `rgba(122, 44, 255, 0.09)` |
| 90 | `linear-gradient(145deg, rgba(255, 255, 255, 0.99), rgba(247, 249, 255, 0.99))` |
| 91 | `linear-gradient(115deg, rgba(19, 180, 210, 0.34), rgba(8, 123, 255, 0.35) 36%, rgba(36, 72, 255, 0.38) 68%, rgba(122, 44, 255, 0.34))` |
| 93 | `rgba(8, 123, 255, 0.025)` |
| 94 | `rgba(255, 255, 255, 0.8)` |
| 95 | `rgba(15, 23, 42, 0.055)` |
| 98 | `#f5f8ff` |
| 99 | `rgba(218, 228, 255, 0.52)` |
| 101 | `#172033` |
| 102 | `#526176` |
| 126, 228 | `rgba(34, 197, 94, 0.15)` |
| 126, 210 | `#22c55e` |
| 126 | `rgba(34, 197, 94, 0.3), inset 0 0 20px rgba(34, 197, 94, 0.2)` |
| 127, 229 | `rgba(239, 68, 68, 0.15)` |
| 127 | `#ef4444` |
| 127 | `rgba(239, 68, 68, 0.3), inset 0 0 20px rgba(239, 68, 68, 0.2)` |
| 128, 230 | `rgba(245, 158, 11, 0.15)` |
| 128, 577 | `#f59e0b` |
| 128 | `rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(245, 158, 11, 0.2)` |
| 130, 211, 233 | `rgba(34, 197, 94, 0.1)` |
| 130, 233 | `#16a34a` |
| 130, 233 | `rgba(34, 197, 94, 0.2)` |
| 131, 234 | `rgba(239, 68, 68, 0.1)` |
| 131, 234 | `#dc2626` |
| 131, 234 | `rgba(239, 68, 68, 0.2)` |
| 132, 235, 572 | `rgba(245, 158, 11, 0.1)` |
| 132, 235 | `#d97706` |
| 132, 235, 573 | `rgba(245, 158, 11, 0.2)` |
| 149 | `rgba(19, 221, 244, 0.1)` |
| 150 | `#111827` |
| 206, 257, 552 | `rgba(122, 44, 255, 0.1)` |
| 227 | `rgba(59, 130, 246, 0.15)` |
| 227 | `#60a5fa` |
| 227 | `rgba(59, 130, 246, 0.3)` |
| 228 | `#4ade80` |
| 228 | `rgba(34, 197, 94, 0.3)` |
| 229 | `#f87171` |
| 229 | `rgba(239, 68, 68, 0.3)` |
| 230 | `#fbbf24` |
| 230 | `rgba(245, 158, 11, 0.3)` |
| 232 | `rgba(59, 130, 246, 0.1)` |
| 232 | `#2563eb` |
| 232 | `rgba(59, 130, 246, 0.2)` |
| 253, 297, 524, 554, 560, 718 | `rgba(122, 44, 255, 0.2)` |
| 266 | `linear-gradient(90deg, #13DDF4, #087BFF, #7A2CFF)` |
| 270, 304 | `rgba(8, 123, 255, 0.4)` |
| 287 | `rgba(10, 14, 27, 1)` |
| 288 | `rgba(122, 44, 255, 0.3)` |
| 296, 303, 490, 609 | `#fff` |
| 301, 302, 426, 430 | `#087BFF` |
| 308, 309, 511 | `#13DDF4` |
| 311 | `rgba(19, 221, 244, 0.6)` |
| 348 | `linear-gradient(#090d1a, #090d1a)` |
| 349 | `linear-gradient(115deg, rgba(19, 221, 244, 0.58), rgba(8, 123, 255, 0.58) 34%, rgba(36, 72, 255, 0.64) 67%, rgba(122, 44, 255, 0.62))` |
| 351 | `rgba(36, 72, 255, 0.06)` |
| 352 | `rgba(8, 123, 255, 0.12)` |
| 353 | `rgba(122, 44, 255, 0.08)` |
| 357 | `linear-gradient(145deg, rgba(7, 27, 32, 0.94), rgba(8, 17, 28, 0.98))` |
| 358 | `linear-gradient(120deg, rgba(19, 221, 244, 0.66), rgba(26, 209, 146, 0.42), rgba(8, 123, 255, 0.42))` |
| 359 | `rgba(19, 221, 244, 0.055), 0 0 9px rgba(19, 221, 244, 0.12), 0 0 18px rgba(26, 209, 146, 0.06)` |
| 364 | `linear-gradient(#ffffff, #f8faff)` |
| 365 | `linear-gradient(115deg, rgba(19, 180, 210, 0.46), rgba(8, 123, 255, 0.46) 34%, rgba(36, 72, 255, 0.5) 67%, rgba(122, 44, 255, 0.48))` |
| 366 | `rgba(36, 72, 255, 0.035), 0 8px 24px rgba(15, 23, 42, 0.07)` |
| 370 | `linear-gradient(145deg, #f4fffe, #f8fcff)` |
| 371 | `linear-gradient(120deg, rgba(19, 190, 205, 0.52), rgba(26, 170, 125, 0.35), rgba(8, 123, 255, 0.34))` |
| 372 | `rgba(19, 221, 244, 0.035), 0 6px 16px rgba(15, 23, 42, 0.045)` |
| 439, 532 | `rgba(122, 44, 255, 0.15)` |
| 459 | `#7A2CFF` |
| 462, 564, 638 | `#10B981` |
| 478 | `rgba(0, 0, 0, 0.2)` |
| 481 | `rgba(19, 221, 244, 0.2)` |
| 485 | `rgba(255, 255, 255, 0.6)` |
| 486 | `rgba(19, 221, 244, 0.3)` |
| 494, 629 | `rgba(0,0,0,0.1)` |
| 513 | `#08778b` |
| 523 | `rgba(0,0,0,0.2)` |
| 531 | `rgba(255,255,255,0.8)` |
| 535 | `rgba(122, 44, 255, 0.4)` |
| 565, 640 | `rgba(16, 185, 129, 0.1)` |
| 608 | `linear-gradient(110deg, #13DDF4 0%, #087BFF 36%, #2448FF 66%, #7A2CFF 100%)` |
| 614 | `rgba(122, 44, 255, 0.28)` |
| 623 | `rgba(255,255,255,0.05)` |
| 624, 632 | `rgba(255,255,255,0.1)` |
| 628 | `rgba(0,0,0,0.03)` |
| 635 | `rgba(0,0,0,0.06)` |
| 639 | `rgba(16, 185, 129, 0.3)` |

**`artifacts/crypto-exchange-widget/src/pages/faq.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 6 | `hsl(var(--primary)/0.3)` |
| 26 | `hsl(var(--card))` |
| 27 | `hsl(var(--border) / 0.6)` |
| 31 | `rgb(0 0 0 / 0.05)` |
| 35 | `hsl(222 47% 11%)` |
| 36 | `rgb(0 0 0 / 0.3), inset 0 1px 1px 0 rgba(255,255,255,0.05)` |
| 46 | `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)` |
| 54 | `linear-gradient(135deg, hsl(var(--primary)/0.2), transparent 40%)` |
| 57 | `linear-gradient(135deg, hsl(190 90% 60% / 0.2), hsl(280 80% 60% / 0.1), transparent 60%)` |
| 61 | `hsl(var(--primary) / 0.4)` |
| 62 | `hsl(var(--primary) / 0.12)` |
| 65 | `hsl(222 47% 12%)` |
| 66 | `hsl(280 80% 60% / 0.3)` |
| 67 | `rgba(0,0,0,0.5), 0 0 0 1px hsl(280 80% 60% / 0.1)` |
| 70 | `linear-gradient(135deg, hsl(190 90% 60% / 0.3), hsl(280 80% 60% / 0.3), transparent 60%)` |
| 84, 97, 117 | `hsl(var(--foreground))` |
| 102 | `hsl(var(--primary))` |
| 105 | `hsl(190 90% 75%)` |
| 116 | `hsl(var(--muted) / 0.8)` |
| 122 | `hsl(var(--muted))` |
| 131 | `linear-gradient(135deg, hsl(190 90% 60%), hsl(280 80% 60%))` |
| 150 | `hsl(var(--muted-foreground))` |

**`artifacts/crypto-exchange-widget/src/pages/how-it-works.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 9 | `hsl(var(--card))` |
| 10, 106, 134 | `hsl(var(--border))` |
| 13 | `rgba(0, 0, 0, 0.15)` |
| 20 | `rgba(0, 0, 0, 0.5)` |
| 21 | `rgba(255, 255, 255, 0.08)` |
| 29 | `hsl(var(--border) / 0.5)` |
| 34, 166 | `hsl(var(--muted))` |
| 45, 116 | `hsl(var(--muted-foreground))` |
| 49, 131 | `hsl(var(--background))` |
| 50 | `hsl(var(--foreground))` |
| 51 | `rgba(0,0,0,0.05)` |
| 105 | `hsl(var(--muted) / 0.5)` |
| 160 | `hsl(var(--primary))` |
| 161 | `hsl(var(--primary-foreground))` |
| 189, 193 | `rgba(var(--hiw-flow-a), 0.32)` |
| 191 | `rgba(var(--hiw-flow-b), 0.5)` |
| 192 | `rgba(var(--hiw-flow-a), 0.46)` |
| 200, 275 | `rgba(var(--hiw-flow-a), 0.56)` |
| 202 | `rgba(var(--hiw-flow-b), 0.66)` |
| 203 | `rgba(var(--hiw-flow-a), 0.6)` |
| 204 | `rgba(var(--hiw-flow-a), 0.42)` |
| 208 | `rgba(var(--hiw-flow-a), 0.34)` |
| 210, 263 | `rgba(var(--hiw-flow-a), 0.48)` |
| 211 | `rgba(var(--hiw-flow-b), 0.3)` |
| 216 | `rgba(var(--hiw-flow-b), 0.62)` |
| 217 | `rgba(var(--hiw-flow-a), 0.54)` |
| 225 | `rgba(var(--hiw-flow-b), 0.76)` |
| 226, 277 | `rgba(var(--hiw-flow-a), 0.68)` |
| 232 | `rgba(var(--hiw-comparison-a), 0.28)` |
| 234 | `rgba(var(--hiw-comparison-b), 0.46)` |
| 235 | `rgba(var(--hiw-comparison-a), 0.3)` |
| 247 | `rgba(var(--hiw-comparison-a), 0.5)` |
| 249 | `rgba(var(--hiw-comparison-b), 0.6)` |
| 250 | `rgba(var(--hiw-comparison-a), 0.52)` |
| 251 | `rgba(var(--hiw-comparison-a), 0.38)` |
| 255 | `rgba(var(--hiw-comparison-a), 0.52))` |
| 259 | `rgba(var(--hiw-flow-a), 0.5)` |
| 261 | `rgba(var(--hiw-flow-b), 0.72)` |
| 262 | `rgba(var(--hiw-flow-a), 0.66)` |
| 267 | `rgba(var(--hiw-flow-a), 0.72)` |
| 269 | `rgba(var(--hiw-flow-b), 0.86)` |
| 270 | `rgba(var(--hiw-flow-a), 0.78)` |
| 271 | `rgba(var(--hiw-flow-a), 0.58)` |
| 278 | `rgba(var(--hiw-flow-b), 0.42)` |
| 282 | `rgba(var(--hiw-comparison-a), 0.46)` |
| 284 | `rgba(var(--hiw-comparison-b), 0.68)` |
| 285 | `rgba(var(--hiw-comparison-a), 0.6)` |
| 286 | `rgba(var(--hiw-comparison-a), 0.44)` |
| 290 | `rgba(var(--hiw-comparison-a), 0.68)` |
| 292 | `rgba(var(--hiw-comparison-b), 0.8)` |
| 293 | `rgba(var(--hiw-comparison-a), 0.72)` |
| 294 | `rgba(var(--hiw-comparison-a), 0.54)` |
| 305 | `rgba(var(--hiw-glow-a), 0.28)` |
| 307, 369 | `rgba(var(--hiw-glow-b), 0.42)` |
| 308 | `rgba(var(--hiw-glow-a), 0.3)` |
| 343, 346 | `rgba(var(--hiw-glow-a), 0.48)` |
| 345 | `rgba(var(--hiw-glow-b), 0.58)` |
| 347 | `rgba(var(--hiw-glow-a), 0.38)` |
| 351 | `rgba(var(--hiw-glow-a), 0.35)` |
| 353 | `rgba(var(--hiw-glow-a), 0.55)` |
| 354 | `rgba(var(--hiw-glow-b), 0.32)` |
| 361 | `rgba(var(--hiw-glow-a), 0.48))` |
| 366, 406, 415, 419 | `rgba(var(--hiw-glow-a), 0.58)` |
| 368 | `rgba(var(--hiw-glow-a), 0.68)` |
| 373 | `rgba(var(--hiw-glow-a), 0.65))` |
| 381 | `rgba(34, 211, 238, 0.5)` |
| 382 | `rgba(59, 130, 246, 0.58)` |
| 383 | `rgba(139, 92, 246, 0.5)` |
| 386 | `rgba(34, 211, 238, 0.46)` |
| 387 | `rgba(139, 92, 246, 0.4)` |
| 403 | `rgba(var(--hiw-glow-a), 0.44)` |
| 405 | `rgba(var(--hiw-glow-b), 0.65)` |
| 407 | `rgba(var(--hiw-glow-a), 0.5)` |
| 411 | `rgba(var(--hiw-glow-a), 0.7)` |
| 413 | `rgba(var(--hiw-glow-b), 0.82)` |
| 414 | `rgba(var(--hiw-glow-a), 0.72)` |
| 421 | `rgba(var(--hiw-glow-a), 0.8)` |
| 422 | `rgba(var(--hiw-glow-b), 0.48)` |
| 426 | `rgba(var(--hiw-glow-a), 0.72))` |
| 432 | `rgba(34, 211, 238, 0.78)` |
| 433 | `rgba(59, 130, 246, 0.86)` |
| 434 | `rgba(139, 92, 246, 0.78)` |
| 437 | `rgba(34, 211, 238, 0.7)` |
| 438 | `rgba(139, 92, 246, 0.62)` |

**`artifacts/crypto-exchange-widget/src/pages/site-content-admin.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3 | `hsl(var(--border) / .78)` |
| 4 | `hsl(var(--primary) / .045)` |
| 9, 88, 118, 147 | `hsl(var(--foreground))` |
| 20, 35, 92, 95, 115, 138, 153, 154, 162 | `hsl(var(--primary))` |
| 29, 62, 84, 111 | `hsl(var(--muted-foreground))` |
| 34 | `hsl(var(--primary) / .19)` |
| 35, 150 | `hsl(var(--primary) / .06)` |
| 44, 91, 106, 146 | `hsl(var(--card))` |
| 45 | `hsl(var(--foreground) / .22)` |
| 50 | `hsl(var(--primary) / .22)` |
| 51 | `linear-gradient(112deg, hsl(var(--primary) / .08), hsl(var(--card)) 52%, hsl(264 72% 55% / .035))` |
| 56 | `linear-gradient(#13aee5, #6054d9)` |
| 65 | `hsl(var(--foreground) / .77)` |
| 69 | `hsl(var(--success) / .11)` |
| 69 | `hsl(var(--success))` |
| 73 | `hsl(var(--warning) / .13)` |
| 73 | `hsl(var(--warning))` |
| 78 | `hsl(var(--muted) / .44)` |
| 88 | `hsl(var(--card) / .64)` |
| 91 | `hsl(var(--border) / .7)` |
| 92 | `hsl(var(--foreground) / .07)` |
| 114 | `hsl(var(--primary) / .2)` |
| 114 | `hsl(var(--primary) / .1)` |
| 118 | `hsl(var(--muted) / .65)` |
| 135 | `hsl(var(--background) / .7)` |
| 150 | `hsl(var(--primary) / .4)` |
| 153 | `hsl(var(--primary) / .42)` |
| 154 | `hsl(var(--primary-foreground))` |
| 160 | `linear-gradient(-45deg, hsl(var(--muted) / .18), hsl(var(--muted) / .18) 1px, transparent 1px, transparent 12px), hsl(var(--card))` |

**`artifacts/crypto-exchange-widget/src/pages/user-manual.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 3, 453 | `hsl(var(--background))` |
| 12 | `hsl(var(--border) / 0.5)` |
| 13 | `linear-gradient(180deg, hsl(var(--primary) / 0.05) 0%, transparent 100%)` |
| 29, 202, 275, 552 | `hsl(var(--primary) / 0.1)` |
| 30, 132, 188, 194, 201, 239, 276, 394, 425, 553, 594, 601, 637, 668 | `hsl(var(--primary))` |
| 44, 109, 151, 160, 184, 220, 290, 358, 377, 491, 609, 696 | `hsl(var(--foreground))` |
| 62, 122, 166, 174, 352, 472, 621, 704 | `hsl(var(--muted-foreground))` |
| 152, 262, 315, 331, 374, 451, 463, 488, 512, 534, 562, 620, 682, 697, 703 | `hsl(var(--border))` |
| 193, 693 | `hsl(var(--muted) / 0.5)` |
| 206, 231 | `hsl(var(--warning))` |
| 207 | `hsl(var(--warning) / 0.15)` |
| 211, 235 | `hsl(var(--success))` |
| 212 | `hsl(var(--success) / 0.15)` |
| 245 | `hsl(var(--foreground) / 0.85)` |
| 261, 317, 490, 536, 564 | `hsl(var(--card))` |
| 335 | `hsl(var(--muted) / 0.35)` |
| 376 | `hsl(var(--background) / 0.9)` |
| 395, 595 | `hsl(var(--primary-foreground))` |
| 396 | `hsl(var(--primary) / 0.2), 0 6px 20px hsl(var(--foreground) / 0.2)` |
| 424 | `hsl(var(--primary) / 0.12)` |
| 440 | `hsl(222 35% 8% / 0.82)` |
| 454 | `hsl(222 35% 3% / 0.45)` |
| 500 | `hsl(var(--muted) / 0.45)` |
| 577 | `linear-gradient(hsl(var(--background) / 0.88), hsl(var(--background) / 0.95))` |
| 596 | `hsl(var(--primary) / 0.25)` |
| 630 | `hsl(var(--muted))` |
| 675 | `hsl(var(--primary) / 0.8)` |

**`artifacts/crypto-exchange-widget/src/search-fields.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 14, 123 | `hsl(var(--border))` |
| 16 | `hsl(var(--input))` |
| 17 | `hsl(var(--foreground) / 0.03)` |
| 25 | `hsl(var(--muted-foreground) / 0.42)` |
| 26, 31 | `hsl(var(--background))` |
| 30 | `hsl(var(--primary) / 0.72)` |
| 32 | `hsl(var(--primary) / 0.12)` |
| 44 | `hsl(var(--muted-foreground))` |
| 54 | `hsl(var(--primary))` |
| 73 | `hsl(var(--foreground))` |
| 85 | `hsl(var(--muted-foreground) / 0.72)` |

**`artifacts/quickxchange-telegram-mini-app/src/index.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 9, 293 | `hsl(var(--background))` |
| 10, 256, 294, 415 | `hsl(var(--foreground))` |
| 11, 17, 21 | `hsl(var(--border))` |
| 12, 295 | `hsl(var(--input))` |
| 13 | `hsl(var(--ring))` |
| 15, 276 | `hsl(var(--card))` |
| 16, 279 | `hsl(var(--card-foreground))` |
| 19 | `hsl(var(--popover))` |
| 20 | `hsl(var(--popover-foreground))` |
| 23, 303, 412 | `hsl(var(--primary))` |
| 24 | `hsl(var(--primary-foreground))` |
| 26 | `hsl(var(--secondary))` |
| 27 | `hsl(var(--secondary-foreground))` |
| 29 | `hsl(var(--muted))` |
| 30, 288, 300, 414 | `hsl(var(--muted-foreground))` |
| 32 | `hsl(var(--accent))` |
| 33 | `hsl(var(--accent-foreground))` |
| 35 | `hsl(var(--destructive))` |
| 36 | `hsl(var(--destructive-foreground))` |
| 131 | `radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.12), transparent 40%)` |
| 132 | `radial-gradient(circle at 80% 20%, hsl(var(--secondary) / 0.10), transparent 30%)` |
| 133 | `radial-gradient(circle at 20% 80%, hsl(var(--accent) / 0.10), transparent 30%)` |
| 149 | `#fff` |
| 150 | `linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))` |
| 175, 246 | `rgba(0,0,0,0.5)` |
| 183 | `rgba(255, 255, 255, 0.15)` |
| 188 | `rgba(255, 255, 255, 0.05)` |
| 197 | `hsl(var(--primary) / 0.25)` |
| 202 | `linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--muted)/0.5) 100%)` |
| 225 | `linear-gradient(to bottom right, hsl(var(--primary)/0.5), transparent, hsl(var(--accent)/0.5))` |
| 226, 227 | `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)` |
| 243 | `rgba(0,0,0,0.1)` |
| 266, 402 | `hsl(var(--border) / 0.6)` |
| 267 | `hsl(var(--background) / 0.96)` |
| 304 | `hsl(var(--primary) / 0.18)` |
| 402 | `hsl(var(--muted) / 0.6)` |
| 409 | `hsl(var(--primary) / 0.2)` |
| 410 | `linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.06))` |

**`lib/payment-logo/src/styles.css`**

| Exact line(s) | Value / excerpt |
|---|---|
| 13, 15 | `hsl(var(--background))` |
| 16 | `hsl(var(--foreground) / 0.28)` |
| 37 | `hsl(var(--primary) / 0.14)` |
| 38 | `hsl(var(--foreground))` |
| 52 | `color-mix(in srgb, currentColor 14%, transparent)` |
| 54 | `color-mix(in srgb, currentColor 4%, transparent)` |
| 71 | `rgba(255, 255, 255, 0.76))` |
| 76 | `#f5f6f8` |
| 77 | `rgba(255, 255, 255, 0.88)` |
| 82 | `rgba(255, 255, 255, 0.38))` |

## Appendix B — Bundled reusable/public assets

Uploaded media are stored separately and are not exported here. Replace company-owned logos and tutorial artwork for a new client; retain official asset/payment-provider artwork only where legally permitted. Binary files have no meaningful source line; their exact path is the location. SVG/text references are indexed above.

- `artifacts/crypto-exchange-widget/public/apple-touch-icon.png`
- `artifacts/crypto-exchange-widget/public/brand/invoice/DejaVuSans-Bold.ttf`
- `artifacts/crypto-exchange-widget/public/brand/invoice/DejaVuSans.ttf`
- `artifacts/crypto-exchange-widget/public/brand/invoice/quickxchange-v1.png`
- `artifacts/crypto-exchange-widget/public/brand/quickxchange-header-dark.png`
- `artifacts/crypto-exchange-widget/public/brand/quickxchange-header-light.png`
- `artifacts/crypto-exchange-widget/public/brand/quickxchange-mark.png`
- `artifacts/crypto-exchange-widget/public/brand/quickxchange-telegram-bot-logo.jpg`
- `artifacts/crypto-exchange-widget/public/favicon-16x16.png`
- `artifacts/crypto-exchange-widget/public/favicon-32x32.png`
- `artifacts/crypto-exchange-widget/public/favicon-48x48.png`
- `artifacts/crypto-exchange-widget/public/favicon.ico`
- `artifacts/crypto-exchange-widget/public/favicon.svg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/aurora-chain.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/blueprint-future.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/cosmic-exchange.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/crystal-ledger.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/electric-canyon.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/liquid-token.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/neon-orbit.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/network-bloom.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/prism-vault.jpg`
- `artifacts/crypto-exchange-widget/public/landing-backgrounds/quantum-grid.jpg`
- `artifacts/crypto-exchange-widget/public/logo-dark.svg`
- `artifacts/crypto-exchange-widget/public/logo-light.svg`
- `artifacts/crypto-exchange-widget/public/logo.svg`
- `artifacts/crypto-exchange-widget/public/manual/convert-guide.jpg`
- `artifacts/crypto-exchange-widget/public/manual/swap-guide.jpg`
- `artifacts/crypto-exchange-widget/public/manual/tracking-guide.jpg`
- `artifacts/crypto-exchange-widget/public/payment-methods/sepa-logo.png`
- `artifacts/crypto-exchange-widget/public/payment-methods/ziraat-bank-logo.jpg`
- `artifacts/quickxchange-telegram-mini-app/public/favicon.svg`

## Appendix C — Backend route inventory

Each entry includes the exact route declaration. Mounts and permissions are defined in artifacts/api-server/src/routes/index.ts; a declaration may span multiple lines or be generated in a loop. Financial API routes are CORE; provider selection and credentials are client configuration.

- `artifacts/api-server/src/routes/affiliate.ts:10` — `router.get("/affiliate/referral/:code", async (req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:21` — `router.get("/account/affiliate", requireCustomer, async (req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:32` — `router.post("/account/affiliate/bind", requireCustomer, async (req, res) => { const body = BindAffiliateReferrerBody.parse(req.body ?? {}); res.json(await bindAffiliateReferrer(res.locals.customerClerkUserId, body.code ?? String(req.cookies?.affiliate_referral`
- `artifacts/api-server/src/routes/affiliate.ts:33` — `router.post("/account/affiliate/attribution", requireCustomer, async (req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:42` — `router.get("/account/affiliate/commissions", requireCustomer, async (req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:56` — `router.get("/account/affiliate/payout-networks", requireCustomer, async (_req, res) => res.json(await enabledAffiliatePayoutNetworks()));`
- `artifacts/api-server/src/routes/affiliate.ts:57` — `router.post("/account/affiliate/payouts", requireCustomer, async (req, res) => { const body = RequestAffiliatePayoutBody.parse(req.body); res.status(201).json(await requestAffiliatePayout(res.locals.customerClerkUserId, body.amountUsd, body.networkId, body.wal`
- `artifacts/api-server/src/routes/affiliate.ts:58` — `router.get("/account/affiliate/referrals", requireCustomer, async (req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:81` — `router.get("/account/affiliate/payouts", requireCustomer, async (req, res) => { const q = GetAffiliatePayoutHistoryQueryParams.parse(req.query); const a = await ensureAffiliateAccount(res.locals.customerClerkUserId); res.json(await db.select().from(affiliatePa`
- `artifacts/api-server/src/routes/affiliate.ts:82` — `router.get("/admin/affiliate/settings", requireOperator, async (_req, res) => res.json((await db.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1))[0] ?? null));`
- `artifacts/api-server/src/routes/affiliate.ts:83` — `router.post("/admin/affiliate/settings", requireOwner, async (req, res) => { const body = CreateAffiliateSettingsVersionBody.parse(req.body); const created = await db.transaction(async tx => { await tx.execute(sql&#96;select pg_advisory_xact_lock(${AFFILIATE_PROGR`
- `artifacts/api-server/src/routes/affiliate.ts:84` — `router.get("/admin/affiliate/payouts", requireOperator, async (req, res) => { const q = GetAffiliatePayoutQueueQueryParams.parse(req.query); res.json(await db.select().from(affiliatePayoutRequestsTable).orderBy(desc(affiliatePayoutRequestsTable.requestedAt), d`
- `artifacts/api-server/src/routes/affiliate.ts:85` — `router.patch("/admin/affiliate/payouts/:id", requireOperator, async (req, res) => { const { id } = TransitionAffiliatePayoutParams.parse({ id: req.params.id }); const { status, txid } = TransitionAffiliatePayoutBody.parse(req.body); if (status === "paid" && !t`
- `artifacts/api-server/src/routes/affiliate.ts:86` — `router.get("/admin/affiliate/overview", requireOperator, async (_req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:134` — `router.get("/admin/affiliate/accounts", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/affiliate.ts:164` — `router.get("/admin/affiliate/accounts/:id", requireOperator, async (req, res) => { const { id } = GetAffiliateAccountParams.parse({ id: req.params.id }); const q = GetAffiliateAccountQueryParams.parse(req.query); const [account] = await db.select().from(affili`
- `artifacts/api-server/src/routes/affiliate.ts:165` — `router.get("/admin/affiliate/commissions", requireOperator, async (req, res) => { const q = SearchAffiliateCommissionsQueryParams.parse(req.query); const conditions = [q.affiliateAccountId ? eq(affiliateCommissionsTable.affiliateAccountId, q.affiliateAccountId`
- `artifacts/api-server/src/routes/affiliate.ts:166` — `router.get("/admin/affiliate/valuation-reviews", requireOperator, async (req, res) => { const q = GetAffiliateValuationReviewsQueryParams.parse(req.query); res.json(await db.select().from(affiliateValuationReviewsTable).where(q.state ? eq(affiliateValuationRev`
- `artifacts/api-server/src/routes/affiliate.ts:167` — `router.get("/admin/affiliate/valuation-reviews/:id", requireOperator, async (req, res) => { const { id } = GetAffiliateValuationReviewParams.parse({ id: req.params.id }); const [review] = await db.select().from(affiliateValuationReviewsTable).where(eq(affiliat`
- `artifacts/api-server/src/routes/affiliate.ts:168` — `router.patch("/admin/affiliate/valuation-reviews/:id", requireOwner, async (req, res) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:35` — `router.get("/admin/blockchain-monitoring/registration-gaps", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:38` — `router.post("/admin/blockchain-monitoring/registration-gaps/:orderId/activate", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:223` — `router.get("/admin/blockchain-monitoring/setup/routes", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:254` — `router.post("/admin/blockchain-monitoring/setup/enable-ready", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:261` — `router.post("/admin/blockchain-monitoring/setup/enable-selected", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:269` — `router.get("/admin/blockchain-monitoring/assets/list", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:272` — `router.post("/admin/blockchain-monitoring/assets/upsert", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:286` — `router.get("/admin/blockchain-monitoring/networks", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:293` — `router.post("/admin/blockchain-monitoring/networks", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:304` — `router.patch("/admin/blockchain-monitoring/networks/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:316` — `router.post("/admin/blockchain-monitoring/networks/:id/test", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:334` — `router.get("/admin/blockchain-monitoring/watches", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:344` — `router.get("/admin/blockchain-monitoring/matches", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blockchain-monitoring.ts:354` — `router.post("/admin/blockchain-monitoring/matches/:id/review", async (req, res, next) => {`
- `artifacts/api-server/src/routes/blog.ts:1277` — `router.get("/blog/articles", async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1282` — `router.get("/blog/articles/:slug", async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1291` — `router.get("/blog/categories", async (_req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1298` — `router.get("/admin/blog/articles", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1303` — `router.get("/admin/blog/articles/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1310` — `router.post("/admin/blog/articles", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1346` — `router.patch("/admin/blog/articles/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1390` — `router.delete("/admin/blog/articles/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1432` — `router.post("/admin/blog/articles/:id/publish", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1437` — `router.post("/admin/blog/articles/:id/unpublish", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1442` — `router.post("/admin/blog/articles/:id/schedule", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1449` — `router.get("/admin/blog/categories", requireOperator, async (_req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1454` — `router.post("/admin/blog/categories", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1460` — `router.patch("/admin/blog/categories/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1468` — `router.delete("/admin/blog/categories/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1476` — `router.get("/admin/blog/settings", requireOperator, async (_req, res) => res.json(GetAdminBlogSettingsResponse.parse(await getSettings())));`
- `artifacts/api-server/src/routes/blog.ts:1477` — `router.put("/admin/blog/settings", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1516` — `router.post("/admin/blog/images/upload", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1521` — `router.get("/admin/blog/sources", requireOperator, async (_req, res) => res.json(ListAdminBlogSourcesResponse.parse(await db.select().from(blogAutomationSourcesTable))));`
- `artifacts/api-server/src/routes/blog.ts:1522` — `router.post("/admin/blog/sources", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1529` — `router.patch("/admin/blog/sources/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1538` — `router.delete("/admin/blog/sources/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1544` — `router.post("/admin/blog/automation/run", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/blog.ts:1549` — `router.post("/admin/blog/automation/preview", requireOperator, async (_req, res) => {`
- `artifacts/api-server/src/routes/convert-compatibility.ts:134` — `router.post("/exchange/quote", async (req, res, next) => {`
- `artifacts/api-server/src/routes/convert-compatibility.ts:173` — `router.post("/exchange/orders", create);`
- `artifacts/api-server/src/routes/convert-compatibility.ts:174` — `router.post("/orders", create);`
- `artifacts/api-server/src/routes/convert-compatibility.ts:176` — `router.patch(`
- `artifacts/api-server/src/routes/convert-compatibility.ts:301` — `router.patch("/orders/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/convert-compatibility.ts:371` — `router.get("/admin/summary", async (req, res, next) => {`
- `artifacts/api-server/src/routes/customer-management.ts:135` — `router.get("/admin/customers/:id", requireOperator, async (req, res, next) => { try {`
- `artifacts/api-server/src/routes/customer-management.ts:139` — `router.get("/admin/customers/:id/referrals", requireOperator, async (req, res, next) => { try {`
- `artifacts/api-server/src/routes/customer-management.ts:159` — `router.patch("/admin/customers/:id", requireOwner, async (req, res, next) => { try {`
- `artifacts/api-server/src/routes/customer-management.ts:188` — `router.post(path, requireOwner, async (req, res, next) => { try {`
- `artifacts/api-server/src/routes/exchange-config.ts:30` — `router.get("/exchange/config", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange-config.ts:92` — `router.get("/admin/swap-default-pair", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange-config.ts:98` — `router.put("/admin/swap-default-pair", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange-config.ts:128` — `router.get("/admin/convert-default-pair", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange-config.ts:134` — `router.put("/admin/convert-default-pair", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange.ts:1774` — `router.get("/exchange/popular-pairs", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:1783` — `router.get("/exchange/route-pricing", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:1796` — `router.post("/exchange/quote", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:1814` — `router.post("/exchange/quote-by-receive", (req, res, next) =>`
- `artifacts/api-server/src/routes/exchange.ts:2088` — `router.get("/exchange/manual-swap-addons", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2105` — `router.get("/admin/manual-swap-addons", requirePermission("pricing.view"), async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2122` — `router.post("/admin/manual-swap-addons", requirePermission("pricing.manage"), async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2165` — `router.patch("/admin/manual-swap-addons/:id", requirePermission("pricing.manage"), async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2216` — `router.delete("/admin/manual-swap-addons/:id", requirePermission("pricing.manage"), async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2240` — `router.get("/admin/manual-swap-fee-config", requirePermission("pricing.view"), async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2248` — `router.put("/admin/manual-swap-fee-config", requirePermission("pricing.manage"), async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2256` — `router.post("/admin/manual-swap-fee-preview", requirePermission("pricing.view"), async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2330` — `router.post("/admin/manual-desk-pricing-rules/quote-preview", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2434` — `router.get("/orders", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2621` — `router.get("/orders/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2641` — `router.patch("/orders/:id/support-tools", requirePermission("orders.details"), requirePermission("orders.support_tools"), async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2727` — `router.post("/orders/:id/assignment", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2760` — `router.post("/orders/bulk/archive", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2809` — `router.post("/orders/bulk/delete", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2896` — `router.post("/orders/:id/archive", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2914` — `router.post("/orders/:id/restore", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2932` — `router.get("/orders/:id/audit-log", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:2952` — `router.get("/orders/:id/status", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:3028` — `router.get("/account/orders", requireCustomer, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:3066` — `router.post("/account/orders/claim", requireCustomer, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:3145` — `router.get("/account/orders/:id", requireCustomer, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:3179` — `router.patch(`
- `artifacts/api-server/src/routes/exchange.ts:3916` — `router.post("/exchange/orders", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:3976` — `router.post("/orders", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4228` — `router.post("/orders/bulk/status", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4325` — `router.post("/orders/:id/mark-paid", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4384` — `router.post("/orders/:id/cancel", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4467` — `router.patch("/orders/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4679` — `router.get("/storage/objects/payment-method-logos/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4709` — `router.get(&#96;/storage/objects/${namespace}/:id&#96;, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4722` — `router.use("/admin", requireOperator);`
- `artifacts/api-server/src/routes/exchange.ts:4784` — `router.get("/admin/manual-desk-revenue", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange.ts:4794` — `router.get("/admin/manual-desk-revenue.csv", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange.ts:4817` — `router.get("/admin/summary", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/exchange.ts:4901` — `router.get("/admin/customers", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4954` — `router.get("/admin/manual-desk-pricing-rules", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4986` — `router.post("/admin/manual-desk-pricing-rules", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:4999` — `router.post("/admin/manual-desk-pricing-rules/bulk", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5067` — `router.post("/admin/manual-desk-pricing-rules/bulk-create", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5082` — `router.post("/admin/manual-desk-pricing-rules/preview", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5095` — `router.patch("/admin/manual-desk-pricing-rules/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5109` — `router.delete("/admin/manual-desk-pricing-rules/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5298` — `router.get("/admin/crypto-assets", requireOperator, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5310` — `router.use(["/admin/crypto-assets", "/admin/crypto-networks"], (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5319` — `router.post("/admin/crypto-assets/reconcile-customer-deposits", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5330` — `router.post("/admin/crypto-assets", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5513` — `router.post("/admin/crypto-networks/deposit-provider/preview", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5530` — `router.post("/admin/crypto-networks/deposit-provider/apply", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5689` — `router.post("/admin/crypto-networks/whitebit-auto-mapping/preview", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5700` — `router.post("/admin/crypto-networks/whitebit-auto-mapping/apply", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5771` — `router.post("/admin/crypto-assets/bulk/apply", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:5981` — `router.patch("/admin/crypto-assets/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:6015` — `router.delete("/admin/crypto-assets/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:6040` — `router.put("/admin/crypto-assets/:id/receiving-wallet", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:6411` — `router.post("/admin/crypto-networks/receiving-wallet/preview", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:6571` — `router.put("/admin/crypto-networks/receiving-wallet", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:6977` — `router.get("/admin/crypto-networks", requireOperator, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7005` — `router.get("/admin/deposit-providers", requireOperator, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7012` — `router.patch("/admin/crypto-networks/:id/customer-deposits", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7131` — `router.post("/admin/crypto-networks", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7161` — `router.patch("/admin/crypto-networks/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7302` — `router.delete("/admin/crypto-networks/:id", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7560` — `router.get("/admin/payment-methods", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7573` — `router.post("/admin/payment-methods/bulk-reserve", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7632` — `router.post("/admin/payment-methods/bulk-fields/preview", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7640` — `router.post("/admin/payment-methods/bulk-fields/apply", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7753` — `router.post("/admin/payment-methods/bulk-delete-fields/preview", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7774` — `router.post("/admin/payment-methods/bulk-delete-fields/apply", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7813` — `router.post("/admin/payment-methods", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7849` — `router.patch("/admin/payment-methods/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7888` — `router.delete("/admin/payment-methods/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7898` — `router.post("/admin/payment-methods/logo-upload", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7906` — `router.delete("/admin/payment-methods/logo-upload/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7940` — `router.post(&#96;/admin/${resource}/${uploadName}&#96;, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7947` — `router.delete(&#96;/admin/${resource}/${uploadName}/:id&#96;, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7966` — `router.get("/admin/fiat-currency-payment-methods", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7978` — `router.post("/admin/fiat-currency-payment-methods", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:7992` — `router.post("/admin/fiat-currency-payment-methods/bulk/preview", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8000` — `router.post("/admin/fiat-currency-payment-methods/bulk/apply", requireOperator, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8116` — `router.patch("/admin/fiat-currency-payment-methods/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8134` — `router.delete("/admin/fiat-currency-payment-methods/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8146` — `router.get("/admin/fiat-currencies", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8155` — `router.post("/admin/fiat-currencies", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8203` — `router.patch("/admin/fiat-currencies/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8269` — `router.delete("/admin/fiat-currencies/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8285` — `router.get("/admin/providers/oneforge", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8297` — `router.get("/admin/providers/whitebit", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8305` — `router.get("/admin/providers/whitebit/credentials", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8328` — `router.put("/admin/providers/whitebit/credentials", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8399` — `router.post("/admin/providers/whitebit/credentials/test", requireOwner, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8463` — `router.get("/admin/providers/whitebit/verification-routes", requireOwner, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8514` — `router.post("/admin/providers/whitebit/address-permission/verify", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:8718` — `router.patch("/admin/providers/whitebit", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/exchange.ts:9019` — `router.get("/admin/orders.xml", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/health.ts:7` — `router.get("/healthz", (_req, res) => {`
- `artifacts/api-server/src/routes/health.ts:12` — `router.get("/readyz", async (req, res) => {`
- `artifacts/api-server/src/routes/index.ts:32` — `router.use(healthRouter);`
- `artifacts/api-server/src/routes/index.ts:33` — `router.use(whitebitWebhookRouter);`
- `artifacts/api-server/src/routes/index.ts:34` — `router.use(telegramRouter);`
- `artifacts/api-server/src/routes/index.ts:35` — `router.use(telegramConnectRouter);`
- `artifacts/api-server/src/routes/index.ts:36` — `router.use(telegramMiniAppRouter);`
- `artifacts/api-server/src/routes/index.ts:39` — `router.use("/admin", requireOperator);`
- `artifacts/api-server/src/routes/index.ts:40` — `router.get("/admin/build-info", (_req, res) => {`
- `artifacts/api-server/src/routes/index.ts:44` — `router.use("/admin/whitebit", requireOwner);`
- `artifacts/api-server/src/routes/index.ts:45` — `router.use(whitebitOperatorRouter);`
- `artifacts/api-server/src/routes/index.ts:46` — `router.use(workspaceConfigSyncRouter);`
- `artifacts/api-server/src/routes/index.ts:49` — `router.use(adminPolicy);`
- `artifacts/api-server/src/routes/index.ts:50` — `router.use(languagesRouter);`
- `artifacts/api-server/src/routes/index.ts:51` — `router.use(ratesXmlRouter);`
- `artifacts/api-server/src/routes/index.ts:52` — `router.use(telegramSupportBotRouter);`
- `artifacts/api-server/src/routes/index.ts:53` — `router.use(convertCompatibilityRouter);`
- `artifacts/api-server/src/routes/index.ts:54` — `router.use(exchangeConfigRouter);`
- `artifacts/api-server/src/routes/index.ts:55` — `router.use(blockchainMonitoringRouter);`
- `artifacts/api-server/src/routes/index.ts:56` — `router.use(notificationSettingsRouter);`
- `artifacts/api-server/src/routes/index.ts:57` — `router.use(landingBackgroundRouter);`
- `artifacts/api-server/src/routes/index.ts:58` — `router.use(exchangeRouter);`
- `artifacts/api-server/src/routes/index.ts:59` — `router.use(customerManagementRouter);`
- `artifacts/api-server/src/routes/index.ts:60` — `router.use(siteContentRouter);`
- `artifacts/api-server/src/routes/index.ts:61` — `router.use("/quickex", quickexRouter);`
- `artifacts/api-server/src/routes/index.ts:62` — `router.use(blogRouter);`
- `artifacts/api-server/src/routes/index.ts:63` — `router.use(teamMembersRouter);`
- `artifacts/api-server/src/routes/index.ts:64` — `router.use(operatorsRouter);`
- `artifacts/api-server/src/routes/index.ts:65` — `router.use(affiliateRouter);`
- `artifacts/api-server/src/routes/index.ts:66` — `router.use(newsletterRouter);`
- `artifacts/api-server/src/routes/landing-background.ts:173` — `router.get("/landing-background", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/landing-background.ts:181` — `router.get("/storage/objects/landing-backgrounds/:id", async (req, res, next) => {`
- `artifacts/api-server/src/routes/landing-background.ts:207` — `router.get("/admin/landing-background", requireOperator, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/landing-background.ts:219` — `router.post("/admin/landing-background", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/landing-background.ts:284` — `router.post("/admin/landing-background/upload", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/languages.ts:36` — `router.use(['/languages', '/admin/languages'], (_req, res, next) => { res.setHeader('cache-control', 'no-store'); next(); });`
- `artifacts/api-server/src/routes/languages.ts:37` — `router.get('/languages', async (_req, res) => res.json(publicSettings(await settingsRow())));`
- `artifacts/api-server/src/routes/languages.ts:38` — `router.get('/admin/languages', async (_req, res) => res.json(publicSettings(await settingsRow())));`
- `artifacts/api-server/src/routes/languages.ts:39` — `router.get('/languages/dictionaries/:locale', async (req, res) => {`
- `artifacts/api-server/src/routes/languages.ts:46` — `router.get('/admin/languages/dictionaries/:locale', async (req, res) =>`
- `artifacts/api-server/src/routes/languages.ts:60` — `router.put('/admin/languages', async (req, res) => {`
- `artifacts/api-server/src/routes/languages.ts:65` — `router.put('/admin/languages/dictionaries/:locale', async (req, res) => {`
- `artifacts/api-server/src/routes/newsletter.ts:31` — `router.post("/newsletter/subscribe", async (req, res) => {`
- `artifacts/api-server/src/routes/newsletter.ts:44` — `router.get("/newsletter/unsubscribe", async (req, res) => {`
- `artifacts/api-server/src/routes/newsletter.ts:56` — `router.get("/admin/newsletter/subscribers", requireOperator, async (_req, res) => {`
- `artifacts/api-server/src/routes/newsletter.ts:68` — `router.patch("/admin/newsletter/subscribers/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/newsletter.ts:85` — `router.delete("/admin/newsletter/subscribers/:id", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/newsletter.ts:93` — `router.post("/admin/newsletter/announcements", requireOperator, async (req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:85` — `router.get("/admin/notification-settings", requireOwner, async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:90` — `router.get("/notification-settings/public", async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:95` — `router.put("/admin/notification-settings", requireOwner, async (req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:100` — `router.post("/admin/notification-settings/test-email", requireOwner, async (req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:113` — `router.post("/admin/notification-settings/test-telegram", requireOwner, async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:135` — `router.post("/admin/notification-settings/telegram-link", requireOwner, async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:153` — `router.get("/admin/notification-settings/telegram-health", requireOwner, async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:178` — `router.get("/admin/notification-settings/telegram-link/:id", requireOwner, async (req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:191` — `router.post("/admin/notification-settings/telegram-disconnect", requireOwner, async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:221` — `router.get("/admin/notification-settings/email-templates", requireOwner, async (_req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:225` — `router.put("/admin/notification-settings/email-templates", requireOwner, async (req, res) => {`
- `artifacts/api-server/src/routes/notification-settings.ts:254` — `router.post("/admin/notification-settings/email-templates/test", requireOwner, async (req, res) => {`
- `artifacts/api-server/src/routes/operators.ts:19` — `router.use("/admin", requireOwner);`
- `artifacts/api-server/src/routes/operators.ts:73` — `router.get("/admin/operators", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/operators.ts:83` — `router.post("/admin/operators/invitations", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/operators.ts:135` — `router.post("/admin/operators/:id/approve", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/operators.ts:186` — `router.post("/admin/operators/:id/suspend", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/operators.ts:232` — `router.delete("/admin/operators/:id", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/operators.ts:278` — `router.get("/admin/operator-audit", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:38` — `router.use("/admin", requireOperator);`
- `artifacts/api-server/src/routes/quickex.ts:50` — `router.get("/config", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:57` — `router.get("/pairs", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:64` — `router.post("/quote", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:72` — `router.post("/quote-by-receive", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:82` — `router.post("/create-order", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:123` — `router.get("/orders/:id/status", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:132` — `router.post("/validate-address", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:145` — `router.get("/admin/credentials", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:150` — `router.put("/admin/credentials", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:186` — `router.get("/admin/diagnostics", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/quickex.ts:189` — `router.post("/admin/credentials/test", requireOwner, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/rates-xml.ts:22` — `router.get("/rates.xml", async (_req, res, next) => {`
- `artifacts/api-server/src/routes/rates-xml.ts:33` — `router.get("/admin/rates-xml", requireOwner, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/rates-xml.ts:37` — `router.get("/admin/rates-xml/preview", requireOwner, async (_req, res, next) => {`
- `artifacts/api-server/src/routes/rates-xml.ts:41` — `router.patch("/admin/rates-xml/method", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/site-content.ts:465` — `router.get("/site-content", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:503` — `router.get("/website-branding", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:509` — `router.get("/storage/objects/website-branding/:id", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:537` — `router.get("/storage/objects/social-trust-icons/:id", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:559` — `router.get("/site-content/:pageKey", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:570` — `router.get("/site-navigation", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:580` — `router.get("/partner-logos", async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:589` — `router.get("/storage/objects/partner-logos/:id", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:623` — `router.get("/storage/objects/site-page-media/:id", async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:668` — `router.get("/admin/partner-logos/:id/preview", requireOperator, async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:714` — `router.post("/contact-submissions", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:763` — `router.get("/admin/site-content", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:769` — `router.get("/admin/website-branding", requireOwner, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:774` — `router.post("/admin/website-branding/upload", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:779` — `router.put("/admin/website-branding", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:851` — `router.post("/admin/website-branding/reset", requireOwner, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:897` — `router.post("/admin/site-content", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:903` — `router.get("/admin/site-content/:pageKey", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:909` — `router.put("/admin/site-content/:pageKey", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:916` — `router.post("/admin/site-content/:pageKey", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:955` — `router.get("/admin/site-content/:pageKey/preview", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:962` — `router.post("/admin/site-page-media/upload", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:967` — `router.get("/admin/site-page-media/:pageKey/:id/preview", requireOperator, async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:995` — `router.post("/admin/site-publication", requireOwner, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1141` — `router.get("/admin/site-navigation", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1147` — `router.post("/admin/site-navigation", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1168` — `router.delete("/admin/site-navigation/:id", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1183` — `router.get("/admin/partner-logos", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1190` — `router.get("/admin/partner-logo-settings", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1194` — `router.put("/admin/partner-logo-settings", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1211` — `router.post("/admin/partner-logos/upload", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1216` — `router.post("/admin/partner-logos", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1238` — `router.patch("/admin/partner-logos/:id", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1262` — `router.delete("/admin/partner-logos/:id", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1280` — `router.get("/admin/social-trust", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1284` — `router.put("/admin/social-trust", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1309` — `router.put("/admin/social-trust/social-media", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1350` — `router.post("/admin/social-trust/upload", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1355` — `router.post("/admin/social-trust/items", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1389` — `router.patch("/admin/social-trust/items/:id", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1420` — `router.delete("/admin/social-trust/items/:id", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1432` — `router.get("/admin/social-trust/items/:id/preview", requireOperator, async (req, res, next): Promise<void> => {`
- `artifacts/api-server/src/routes/site-content.ts:1458` — `router.get("/admin/contact-submissions", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:133` — `router.get("/admin/authorization", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:157` — `router.get("/admin/team-members", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:165` — `router.post("/admin/team-members", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:210` — `router.patch("/admin/team-members/:id", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:263` — `router.post("/admin/team-members/:id/suspend", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:266` — `router.post("/admin/team-members/:id/reactivate", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:270` — `router.delete("/admin/team-members/:id", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:285` — `router.get("/admin/team-roles", requireOperator, async (_req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:290` — `router.post("/admin/team-roles", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:301` — `router.patch("/admin/team-roles/:id", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:323` — `router.delete("/admin/team-roles/:id", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/team-members.ts:347` — `router.get("/admin/activity", requireOperator, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-connect.ts:21` — `router.get("/telegram/connect/status", async (req, res, next) => {`
- `artifacts/api-server/src/routes/telegram-connect.ts:39` — `router.post("/telegram/connect", requireCustomer, async (req, res, next) => {`
- `artifacts/api-server/src/routes/telegram-mini-app.ts:225` — `router.post("/telegram/mini-app/session", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-mini-app.ts:280` — `router.get("/telegram/mini-app/orders", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-mini-app.ts:287` — `router.get("/telegram/mini-app/orders/:id", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-mini-app.ts:300` — `router.post("/telegram/mini-app/account-link", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-mini-app.ts:312` — `router.post("/telegram/mini-app/orders/link", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-support-bot.ts:143` — `router.get("/admin/telegram/support-bot", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-support-bot.ts:155` — `router.put("/admin/telegram/support-bot", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-support-bot.ts:168` — `router.post("/admin/telegram/support-bot/connection/check", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-support-bot.ts:179` — `router.post("/admin/telegram/support-bot/connection/register", requireOwner, async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram-support-bot.ts:190` — `router.post("/telegram/support/webhook", async (req, res): Promise<void> => {`
- `artifacts/api-server/src/routes/telegram.ts:1667` — `router.post("/telegram/webhook", async (req: Request, res) => {`
- `artifacts/api-server/src/routes/workspace-config-sync.ts:329` — `router.post("/admin/workspace-config/preview", requireOwner, async (req, res, next) => {`
- `artifacts/api-server/src/routes/workspace-config-sync.ts:336` — `router.post("/admin/workspace-config/apply", requireOwner, async (req, res, next) => {`


## Appendix D — Canonical catalog / policy reference — `artifacts/api-server/src/lib/global-payment-catalog.ts`

- **Line 247**: `code: code as string,`
- **Line 257**: `{ id: "swift-bank-transfer", name: "SWIFT bank transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: SWIFT_CURRENCIES, regions: ["Global"], fields: [accountHolder, bankAccount, bic], description: "International bank settlement requiring operator review." },`
- **Line 258**: `{ id: "sepa-transfer", name: "SEPA transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: SEPA_CURRENCIES, regions: ["EEA", "SEPA"], fields: [accountHolder, iban], description: "EUR transfer within the SEPA area." },`
- **Line 259**: `{ id: "sepa-instant", name: "SEPA Instant", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["SEPA"], fields: [accountHolder, iban], description: "EUR instant transfer where participating banks support it." },`
- **Line 260**: `{ id: "paysera", name: "Paysera", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a Paysera account." },`
- **Line 261**: `{ id: "bunq", name: "bunq", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a bunq account." },`
- **Line 262**: `{ id: "bbva", name: "BBVA", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a BBVA account." },`
- **Line 263**: `{ id: "icard", name: "iCard", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to an iCard account." },`
- **Line 264**: `{ id: "bnp-paribas", name: "BNP Paribas", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a BNP Paribas account." },`
- **Line 265**: `{ id: "ing", name: "ING", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to an ING account." },`
- **Line 266**: `{ id: "commerzbank", name: "Commerzbank", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a Commerzbank account." },`
- **Line 267**: `{ id: "caixabank", name: "CaixaBank", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a CaixaBank account." },`
- **Line 268**: `{ id: "ach", name: "ACH", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [accountHolder, bankAccount, routingNumber], description: "US domestic ACH transfer." },`
- **Line 269**: `{ id: "fedwire", name: "Fedwire", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [accountHolder, bankAccount, routingNumber], description: "US domestic wire transfer." },`
- **Line 270**: `{ id: "faster-payments", name: "Faster Payments", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["GBP"], countries: ["GB"], fields: [accountHolder, bankAccount], description: "UK domestic faster payment." },`
- **Line 271**: `{ id: "chaps", name: "CHAPS", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["GBP"], countries: ["GB"], fields: [accountHolder, bankAccount], description: "UK high-value bank transfer." },`
- **Line 272**: `{ id: "interac", name: "Interac e-Transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["CAD"], countries: ["CA"], fields: [walletEmail, recipientName], description: "Canadian domestic email transfer." },`
- **Line 273**: `{ id: "pix", name: "PIX", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["BRL"], countries: ["BR"], fields: [recipientName, phone], description: "Brazilian instant payment; operator verifies the payout key." },`
- **Line 274**: `{ id: "spei", name: "SPEI", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["MXN"], countries: ["MX"], fields: [accountHolder, bankAccount, bankCode], description: "Mexican domestic bank transfer." },`
- **Line 275**: `{ id: "upi", name: "UPI", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["INR"], countries: ["IN"], fields: [recipientName, phone], description: "Indian instant payment; operator verifies the UPI identifier." },`
- **Line 276**: `{ id: "imps-neft-rtgs", name: "IMPS / NEFT / RTGS", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["INR"], countries: ["IN"], fields: [accountHolder, bankAccount, bankCode], description: "Indian domestic bank transfer." },`
- **Line 277**: `{ id: "payid-npp", name: "PayID / NPP", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["AUD"], countries: ["AU"], fields: [recipientName, phone], description: "Australian instant payment; operator verifies the PayID." },`
- **Line 278**: `{ id: "paynow", name: "PayNow", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["SGD"], countries: ["SG"], fields: [recipientName, phone], description: "Singapore domestic instant payment." },`
- **Line 279**: `{ id: "promptpay", name: "PromptPay", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["THB"], countries: ["TH"], fields: [recipientName, phone], description: "Thai domestic instant payment." },`
- **Line 280**: `{ id: "local-bank-transfer", name: "Local bank transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["AED", "TRY", "KZT", "UAH", "NGN", "ZAR"], fields: [accountHolder, bankAccount, bankCode], description: "Operator-managed domestic bank transfer." },`
- **Line 281**: `{ id: "revolut-eur", name: "Revolut EUR", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "United Kingdom"], fields: [accountHolder, iban], description: "Manual settlement to a Revolut EUR account." },`
- **Line 282**: `{ id: "revolut-usd", name: "Revolut USD", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], regions: ["EEA", "United Kingdom"], fields: [accountHolder, bankAccount, bic], description: "Manual settlement to a Revolut USD account." },`
- **Line 283**: `{ id: "paypal", name: "PayPal", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP", "CAD", "AUD"], fields: [walletEmail], description: "Manual e-wallet settlement using an account email." },`
- **Line 284**: `{ id: "skrill", name: "Skrill", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP"], fields: [walletEmail], description: "Manual e-wallet settlement using an account email." },`
- **Line 285**: `{ id: "perfect-money", name: "Perfect Money", family: "digital-wallet", executionMode: "manual", lifecycle: "restricted", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual wallet settlement subject to compliance review." },`
- **Line 286**: `{ id: "payeer", name: "Payeer", family: "digital-wallet", executionMode: "manual", lifecycle: "restricted", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual wallet settlement subject to compliance review." },`
- **Line 287**: `{ id: "capitalist", name: "Capitalist", family: "digital-wallet", executionMode: "manual", lifecycle: "restricted", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual wallet settlement subject to compliance review." },`
- **Line 288**: `{ id: "volet", name: "Volet", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual e-wallet settlement using the account email." },`
- **Line 289**: `{ id: "neteller", name: "Neteller", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP"], fields: [walletEmail], description: "Manual e-wallet settlement using the account email." },`
- **Line 290**: `{ id: "wise", name: "Wise", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP", "AUD", "CAD"], fields: [accountHolder, bankAccount], description: "Manual settlement to a Wise account." },`
- **Line 291**: `{ id: "zelle", name: "Zelle", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [walletEmail, phone], description: "US domestic settlement." },`
- **Line 292**: `{ id: "cash-app", name: "Cash App", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [phone, recipientName], description: "US manual wallet settlement." },`
- **Line 293**: `{ id: "venmo", name: "Venmo", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [phone, recipientName], description: "US manual wallet settlement." },`
- **Line 294**: `{ id: "visa-kzt", name: "KZT Visa card", family: "card", executionMode: "manual", lifecycle: "active", direction: "receive", compatibleCurrencyCodes: ["KZT"], countries: ["KZ"], fields: [recipientName], description: "Card settlement requires an approved operator flow. Never collect card number, security code, or authentication data." },`
- **Line 295**: `{ id: "visa-uah", name: "UAH Visa card", family: "card", executionMode: "manual", lifecycle: "active", direction: "receive", compatibleCurrencyCodes: ["UAH"], countries: ["UA"], fields: [recipientName], description: "Card settlement requires an approved operator flow. Never collect card number, security code, or authentication data." },`
- **Line 296**: `{ id: "mpesa-kenya", name: "M-Pesa Kenya", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["KES"], countries: ["KE"], fields: [phone, recipientName], description: "Manual mobile-money settlement in Kenya." },`
- **Line 297**: `{ id: "mpesa-tanzania", name: "M-Pesa Tanzania", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["TZS"], countries: ["TZ"], fields: [phone, recipientName], description: "Manual mobile-money settlement in Tanzania." },`
- **Line 298**: `{ id: "gcash", name: "GCash", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["PHP"], countries: ["PH"], fields: [phone, recipientName], description: "Manual mobile-wallet settlement in the Philippines." },`
- **Line 299**: `{ id: "bkash", name: "bKash", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["BDT"], countries: ["BD"], fields: [phone, recipientName], description: "Manual mobile-money settlement in Bangladesh." },`
- **Line 300**: `{ id: "easypaisa", name: "Easypaisa", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["PKR"], countries: ["PK"], fields: [phone, recipientName], description: "Manual mobile-wallet settlement in Pakistan." },`
- **Line 301**: `{ id: "alipay", name: "Alipay", family: "ecommerce", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["CNY"], countries: ["CN"], fields: [phone, recipientName], description: "Manual wallet settlement subject to operator and local compliance review." },`
- **Line 302**: `{ id: "wechat-pay", name: "WeChat Pay", family: "ecommerce", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["CNY"], countries: ["CN"], fields: [phone, recipientName], description: "Manual wallet settlement subject to operator and local compliance review." },`
- **Line 303**: `{ id: "card-payout", name: "Card payout", family: "card", executionMode: "manual", lifecycle: "restricted", direction: "receive", compatibleCurrencyCodes: ["USD", "EUR", "GBP"], fields: [recipientName], description: "Operator-approved payout flow; never collect card numbers or security data." },`
- **Line 304**: `{ id: "cash-pickup", name: "Cash pickup", family: "cash", executionMode: "manual", lifecycle: "restricted", direction: "receive", compatibleCurrencyCodes: ["USD", "EUR", "GBP", "KES", "PHP", "MXN"], fields: [recipientName], description: "Operator-arranged payout only; recipient identification and availability are confirmed outside this catalog." },`
- **Line 310**: `id: &#96;${method.id}:${currencyCode}&#96;,`
- **Line 330**: `id: id as string,`
- **Line 331**: `code: code as string,`
- **Line 333**: `decimals: decimals as number,`
- **Line 371**: `id: id as string,`
- **Line 372**: `assetId: assetId as string,`
- **Line 373**: `networkCode: networkCode as string,`
- **Line 374**: `networkName: networkName as string,`
- **Line 375**: `decimals: decimals as number,`
- **Line 377**: `defaultRequiredConfirmations: defaultRequiredConfirmations as number,`
- **Line 381**: `export function findPaymentMethodCatalogItem(id: string): PaymentMethodCatalogItem | undefined {`
- **Line 388**: `const compatibleCurrencyCodes: readonly string[] = item.compatibleCurrencyCodes;`

### Canonical catalog / policy reference — `artifacts/api-server/src/lib/rates-xml-crypto-codes.ts`

- **Line 6**: `TRON: "TRC20", TRX: "TRC20",`
- **Line 7**: `BSC: "BEP20", BNBSMARTCHAIN: "BEP20",`
- **Line 8**: `BINANCESMARTCHAIN: "BEP20",`
- **Line 19**: `const normalize = (value: string) => value.trim().toUpperCase().replace(/[\s_-]/g, "");`
- **Line 20**: `const network = (value: string) => networkAliases[normalize(value)] ?? normalize(value);`
- **Line 30**: `XLM: "XLM", TRX: "TRC20", WAVES: "WAVES", OMG: "ERC20", XVG: "XVG",`
- **Line 36**: `CAKE: "BEP20", APT: "APT", ARB: "ARBITRUM", OP: "OPTIMISM",`
- **Line 40**: `ERC20: "ERC20", TRC20: "TRC20", BEP20: "BEP20", BEP2: "BEP2",`
- **Line 45**: `const symbol = entry.description.match(/\(([^()]+)\)$/)?.[1];`
- **Line 51**: `const chain = suffix ? variants[suffix] : baseNetworks[entry.code];`
- **Line 53**: `return { code: entry.code, asset: symbol, network: chain };`
- **Line 61**: `return matches.length === 1 ? matches[0].code : null;`
- **Line 66**: `configuredCode: string | null | undefined, asset: string, chain: string,`

### Canonical catalog / policy reference — `artifacts/crypto-exchange-widget/src/lib/legal-page-content.ts`

- **Line 2**: `heading: string;`
- **Line 3**: `body: string;`
- **Line 8**: `heading: 'About This Notice',`
- **Line 9**: `body: 'This notice for QuickXchange ("Company," "we," "us," or "our") describes how and why we might collect, store, use, and/or share ("process") your information when you use our Services, such as when you visit the QuickXchange platform or another platform of ours that links to this notice, or engage with us in other related ways, including sales, marketing, or events.\n\nQuestions or concerns? Reading this notice will help you understand your rights and choices.',`
- **Line 12**: `heading: 'Summary of Key Points',`
- **Line 13**: `body: 'This summary provides key points from our notice. More details about these topics are provided in the Privacy Policy.',`
- **Line 16**: `heading: 'What personal information do we process?',`
- **Line 17**: `body: 'When you visit, use, or navigate our Services, we may process personal information depending on how you interact with QuickXchange and the Services, the choices you make, and the products and features you use.',`
- **Line 20**: `heading: 'Do we process sensitive personal information?',`
- **Line 21**: `body: 'We do not process sensitive personal information.',`
- **Line 24**: `heading: 'Do we receive information from third parties?',`
- **Line 25**: `body: 'We do not receive personal information directly from third parties, except when necessary to provide or secure the Services, process a requested transaction, or comply with applicable law.',`
- **Line 28**: `heading: 'How do we process your information?',`
- **Line 29**: `body: 'We process information to provide, improve, and administer our Services, communicate with you, support security and fraud prevention, and comply with the law. We may also process information for other purposes with your consent. We process information only when we have a valid legal reason to do so.',`
- **Line 32**: `heading: 'When do we share personal information?',`
- **Line 33**: `body: 'We may share information in specific situations and with service providers or other parties when needed to operate the Services, process a requested transaction, maintain security, or comply with applicable law.',`
- **Line 36**: `heading: 'How do we keep your information safe?',`
- **Line 37**: `body: 'We use organizational and technical processes intended to protect personal information. However, no electronic transmission over the internet or information-storage technology can be guaranteed to be 100% secure.',`
- **Line 40**: `heading: 'What are your rights?',`
- **Line 41**: `body: 'Depending on where you are located, applicable privacy law may provide certain rights regarding your personal information. The Privacy Policy explains these rights and how to exercise them.',`
- **Line 47**: `heading: 'What Information Do We Collect?',`
- **Line 48**: `body: 'We collect personal information that you voluntarily provide when you register for the Services, request information about our products or services, participate in activities on the Services, complete a transaction, or contact us.\n\nThe information we collect depends on your interactions with QuickXchange, the choices you make, and the products and features you use. It may include your name, phone number, email address, username, billing details, and payment or wallet information needed for a selected transaction route.\n\nAll personal information you provide must be true, complete, and accurate, and you must notify us of relevant changes.',`
- **Line 51**: `heading: 'How Do We Process Your Information?',`
- **Line 52**: `body: 'We process personal information to provide, improve, and administer our Services, communicate with you, support security and fraud prevention, process requested transactions, and comply with applicable law. We may also process information for other purposes with your consent and only when we have a valid legal basis.',`
- **Line 55**: `heading: 'How Do We Keep Your Information Safe?',`
- **Line 56**: `body: 'We use organizational and technical processes and procedures intended to protect personal information. However, no electronic transmission over the internet or information-storage technology can be guaranteed to be 100% secure, and unauthorized parties may attempt to defeat security controls.',`
- **Line 59**: `heading: 'What Are Your Privacy Rights?',`
- **Line 60**: `body: 'You may review, change, or terminate your account at any time, subject to applicable law. If you are located in the EEA or UK and believe your information is being processed unlawfully, you may have the right to complain to your local data-protection supervisory authority. Residents of Switzerland may also contact the applicable data-protection authority.',`
- **Line 63**: `heading: 'Withdrawing Consent',`
- **Line 64**: `body: 'If we rely on your consent to process personal information, you may withdraw that consent at any time by contacting us. Withdrawal does not affect the lawfulness of processing completed before consent was withdrawn, and it does not affect processing that relies on another lawful basis.',`
- **Line 67**: `heading: 'Marketing and Promotional Communications',`
- **Line 68**: `body: 'You may unsubscribe from marketing and promotional communications at any time by using the unsubscribe link in an email or contacting us. We may still send service-related communications needed to administer your account, respond to requests, or provide the Services.',`
- **Line 71**: `heading: 'Account Information',`
- **Line 72**: `body: 'You may review or update available account information through your account settings. You may also request account termination, subject to applicable legal, security, fraud-prevention, and record-retention requirements.',`
- **Line 75**: `heading: 'Controls for Do-Not-Track Features',`
- **Line 76**: `body: 'Some browsers, mobile operating systems, and applications include a Do-Not-Track ("DNT") setting. No uniform technology standard for recognizing and implementing DNT signals has been finalized, so we do not currently respond to DNT browser signals. If a standard we must follow is adopted, we will describe that practice in an updated notice.',`
- **Line 79**: `heading: 'California Privacy Rights',`
- **Line 80**: `body: 'California residents may have rights regarding access to personal information under applicable state law. California residents under 18 with a registered account may also have the right to request removal of certain information they publicly post. Requests are subject to verification and applicable legal limitations, including limitations involving backups and required records.',`
- **Line 83**: `heading: 'Updates to This Notice',`
- **Line 84**: `body: 'We may update this notice as necessary to remain current with applicable law and our practices. An updated version becomes effective when it is made accessible. For material changes, we may post a prominent notice or provide a direct notification.',`
- **Line 87**: `heading: 'Reviewing, Updating, or Deleting Your Data',`
- **Line 88**: `body: 'Depending on the laws that apply where you live, you may have the right to request access to personal information we collect, ask us to correct it, or request deletion. We will consider and act on verified requests in accordance with applicable data-protection law.',`

### Canonical catalog / policy reference — `lib/i18n/src/types.ts`

- **Line 1**: `export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'ko', 'ru', 'uk'] as const;`
- **Line 2**: `export type Locale = typeof SUPPORTED_LOCALES[number];`


## Appendix E — CUSTOMIZABLE persisted field contracts

These are schema declarations, not current database values. Rows marked required mean required for a record without a schema default; relational IDs and review requirements still need an importer/Admin workflow. OFF/zero/empty examples are planning defaults, not proof that the feature is ready. Managed state and credential ciphertext are excluded.


### website_branding_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| lightLogoPath | nullable text | Optional / existing default | null | `lib/db/src/schema/website-branding.ts:7` |
| darkLogoPath | nullable text | Optional / existing default | null | `lib/db/src/schema/website-branding.ts:8` |
| mobileLogoPath | nullable text | Optional / existing default | null | `lib/db/src/schema/website-branding.ts:9` |
| faviconPath | nullable text | Optional / existing default | null | `lib/db/src/schema/website-branding.ts:10` |
| logoWidth | integer | Optional / existing default | 180 | `lib/db/src/schema/website-branding.ts:11` |
| logoHeight | integer | Optional / existing default | 44 | `lib/db/src/schema/website-branding.ts:12` |
| logoMaxWidth | integer | Optional / existing default | 240 | `lib/db/src/schema/website-branding.ts:13` |
| desktopLogoWidth | integer | Optional / existing default | 138 | `lib/db/src/schema/website-branding.ts:14` |
| desktopLogoMaxHeight | integer | Optional / existing default | 30 | `lib/db/src/schema/website-branding.ts:15` |
| tabletLogoWidth | integer | Optional / existing default | 130 | `lib/db/src/schema/website-branding.ts:16` |
| tabletLogoMaxHeight | integer | Optional / existing default | 28 | `lib/db/src/schema/website-branding.ts:17` |
| mobileLogoWidth | integer | Optional / existing default | 116 | `lib/db/src/schema/website-branding.ts:18` |
| mobileLogoMaxHeight | integer | Optional / existing default | 28 | `lib/db/src/schema/website-branding.ts:19` |
| alignment | text | Optional / existing default | "left" | `lib/db/src/schema/website-branding.ts:20` |

### language_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| enabledLanguages | jsonb | Yes | [] | `lib/db/src/schema/languages.ts:6` |
| fallbackLanguage | text | Yes | "" | `lib/db/src/schema/languages.ts:7` |
| overrides | jsonb | Optional / existing default | {} | `lib/db/src/schema/languages.ts:8` |

### fiat_currencies

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| code | text | Yes | "" | `lib/db/src/schema/fiat-currencies.ts:16` |
| name | text | Yes | "" | `lib/db/src/schema/fiat-currencies.ts:17` |
| flagObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/fiat-currencies.ts:18` |
| network | text | Optional / existing default | "fiat" | `lib/db/src/schema/fiat-currencies.ts:19` |
| precision | integer | Optional / existing default | 2 | `lib/db/src/schema/fiat-currencies.ts:20` |
| lifecycle | text | Optional / existing default | "active" | `lib/db/src/schema/fiat-currencies.ts:21` |
| regions | jsonb | Optional / existing default | [] | `lib/db/src/schema/fiat-currencies.ts:22` |
| countries | jsonb | Optional / existing default | [] | `lib/db/src/schema/fiat-currencies.ts:23` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/fiat-currencies.ts:24` |
| rateMode | text | Optional / existing default | "automatic" | `lib/db/src/schema/fiat-currencies.ts:25` |
| manualRate | nullable text | Optional / existing default | null | `lib/db/src/schema/fiat-currencies.ts:26` |

### crypto_assets

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| id | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:20` |
| code | text | Yes | "" | `lib/db/src/schema/crypto-assets.ts:21` |
| name | text | Yes | "" | `lib/db/src/schema/crypto-assets.ts:22` |
| logoObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:23` |
| decimals | integer | Yes | 0 | `lib/db/src/schema/crypto-assets.ts:24` |
| lifecycle | text | Optional / existing default | "active" | `lib/db/src/schema/crypto-assets.ts:25` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/crypto-assets.ts:26` |

### crypto_asset_networks

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| id | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:46` |
| assetId | text | Yes | "" | `lib/db/src/schema/crypto-assets.ts:47` |
| networkCode | text | Yes | "" | `lib/db/src/schema/crypto-assets.ts:50` |
| networkName | text | Yes | "" | `lib/db/src/schema/crypto-assets.ts:51` |
| logoObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:52` |
| networkFamily | text | Optional / existing default | "native" | `lib/db/src/schema/crypto-assets.ts:53` |
| decimals | integer | Yes | 0 | `lib/db/src/schema/crypto-assets.ts:54` |
| executionMode | text | Optional / existing default | "manual" | `lib/db/src/schema/crypto-assets.ts:55` |
| depositProvider | text | Optional / existing default | "manual" | `lib/db/src/schema/crypto-assets.ts:58` |
| whitebitAssetCode | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:61` |
| whitebitNetworkCode | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:62` |
| manualWalletTrackingEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/crypto-assets.ts:63` |
| manualFallbackEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/crypto-assets.ts:66` |
| lifecycle | text | Optional / existing default | "active" | `lib/db/src/schema/crypto-assets.ts:69` |
| regions | jsonb | Optional / existing default | [] | `lib/db/src/schema/crypto-assets.ts:70` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/crypto-assets.ts:71` |
| customerDepositsEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/crypto-assets.ts:72` |
| requiresMemo | boolean | Optional / existing default | false | `lib/db/src/schema/crypto-assets.ts:73` |
| requiredConfirmations | integer | Optional / existing default | 0 | `lib/db/src/schema/crypto-assets.ts:74` |
| confirmationGuidance | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:75` |
| explorerUrlTemplate | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:76` |
| depositInstructions | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:77` |
| depositWarning | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:78` |
| sharedDepositAddress | text | Optional / existing default | "" | `lib/db/src/schema/crypto-assets.ts:79` |
| sharedDepositMemo | nullable text | Optional / existing default | null | `lib/db/src/schema/crypto-assets.ts:80` |

### payment_methods

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| id | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:61` |
| name | text | Yes | "" | `lib/db/src/schema/payment-methods.ts:62` |
| logoObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:63` |
| description | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:64` |
| instructions | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:65` |
| family | text | Optional / existing default | "bank-transfer" | `lib/db/src/schema/payment-methods.ts:66` |
| executionMode | text | Optional / existing default | "manual" | `lib/db/src/schema/payment-methods.ts:67` |
| providerId | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:68` |
| lifecycle | text | Optional / existing default | "active" | `lib/db/src/schema/payment-methods.ts:69` |
| regions | jsonb | Optional / existing default | [] | `lib/db/src/schema/payment-methods.ts:70` |
| countries | jsonb | Optional / existing default | [] | `lib/db/src/schema/payment-methods.ts:71` |
| requiresProviderConfiguration | boolean | Optional / existing default | false | `lib/db/src/schema/payment-methods.ts:72` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/payment-methods.ts:75` |
| canSend | boolean | Optional / existing default | true | `lib/db/src/schema/payment-methods.ts:76` |
| canReceive | boolean | Optional / existing default | true | `lib/db/src/schema/payment-methods.ts:77` |
| fieldDefinitions | jsonb | Optional / existing default | [] | `lib/db/src/schema/payment-methods.ts:78` |

### fiat_currency_payment_methods

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| fiatCurrencyId | uuid | Yes | "" | `lib/db/src/schema/payment-methods.ts:93` |
| paymentMethodId | text | Yes | "" | `lib/db/src/schema/payment-methods.ts:96` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/payment-methods.ts:99` |
| canSend | nullable boolean | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:100` |
| canReceive | nullable boolean | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:101` |
| sendInstructions | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:102` |
| receiveInstructions | nullable text | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:103` |
| minAmount | nullable numeric | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:104` |
| maxAmount | nullable numeric | Optional / existing default | null | `lib/db/src/schema/payment-methods.ts:105` |
| reserve | numeric | Optional / existing default | "0" | `lib/db/src/schema/payment-methods.ts:106` |
| countries | jsonb | Optional / existing default | [] | `lib/db/src/schema/payment-methods.ts:107` |

### manual_desk_pricing_rules

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| name | text | Yes | "" | `lib/db/src/schema/manual-desk-pricing-rules.ts:17` |
| sourceAsset | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:18` |
| targetAsset | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:19` |
| sourceCryptoAssetId | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:20` |
| targetCryptoAssetId | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:21` |
| sourceNetwork | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:22` |
| targetNetwork | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:23` |
| paymentMethod | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:24` |
| payoutMethod | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:25` |
| sourceSettlementOptionId | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:26` |
| targetSettlementOptionId | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:27` |
| minAmount | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:28` |
| maxAmount | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:29` |
| operatorInstructions | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:30` |
| customerInstructions | nullable text | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:31` |
| expectedSettlementMinutes | nullable integer | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:32` |
| markupBasisPoints | integer | Yes | 0 | `lib/db/src/schema/manual-desk-pricing-rules.ts:33` |
| adjustmentDirection | text | Optional / existing default | "MARKUP" | `lib/db/src/schema/manual-desk-pricing-rules.ts:34` |
| fixedFee | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:35` |
| amountBasedPricingEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/manual-desk-pricing-rules.ts:36` |
| amountBasedPricingTiers | jsonb | Optional / existing default | [] | `lib/db/src/schema/manual-desk-pricing-rules.ts:37` |
| rangeOnlyPricing | boolean | Optional / existing default | false | `lib/db/src/schema/manual-desk-pricing-rules.ts:44` |
| exactRate | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-desk-pricing-rules.ts:46` |
| priority | integer | Optional / existing default | 0 | `lib/db/src/schema/manual-desk-pricing-rules.ts:47` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/manual-desk-pricing-rules.ts:48` |

### manual_swap_addons

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| key | text | Yes | "" | `lib/db/src/schema/manual-swap-addons.ts:5` |
| name | text | Yes | "" | `lib/db/src/schema/manual-swap-addons.ts:6` |
| description | text | Optional / existing default | "" | `lib/db/src/schema/manual-swap-addons.ts:7` |
| fixedAmount | numeric | Optional / existing default | "0" | `lib/db/src/schema/manual-swap-addons.ts:8` |
| feeCurrency | text | Yes | "" | `lib/db/src/schema/manual-swap-addons.ts:9` |
| feeType | text | Optional / existing default | "fixed" | `lib/db/src/schema/manual-swap-addons.ts:10` |
| percentage | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-swap-addons.ts:11` |
| translations | jsonb | Optional / existing default | {} | `lib/db/src/schema/manual-swap-addons.ts:12` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/manual-swap-addons.ts:18` |
| selectionRule | text | Optional / existing default | "multiple" | `lib/db/src/schema/manual-swap-addons.ts:19` |
| presentation | jsonb | Yes | {} | `lib/db/src/schema/manual-swap-addons.ts:20` |
| deletedAt | nullable timestamp | Optional / existing default | null | `lib/db/src/schema/manual-swap-addons.ts:21` |

### manual_swap_fee_config

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/manual-swap-addons.ts:32` |
| percentage | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-swap-addons.ts:33` |
| fixedAmount | nullable numeric | Optional / existing default | null | `lib/db/src/schema/manual-swap-addons.ts:34` |
| fixedCurrency | text | Optional / existing default | "USD" | `lib/db/src/schema/manual-swap-addons.ts:35` |

### swap_default_pair_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| sourceSettlementOptionId | text | Yes | "" | `lib/db/src/schema/swap-default-pair.ts:8` |
| targetSettlementOptionId | text | Yes | "" | `lib/db/src/schema/swap-default-pair.ts:9` |

### convert_default_pair_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| fromAsset | text | Yes | "" | `lib/db/src/schema/convert-default-pair.ts:8` |
| fromNetwork | text | Yes | "" | `lib/db/src/schema/convert-default-pair.ts:9` |
| toAsset | text | Yes | "" | `lib/db/src/schema/convert-default-pair.ts:10` |
| toNetwork | text | Yes | "" | `lib/db/src/schema/convert-default-pair.ts:11` |

### blockchain_monitor_networks

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| id | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:27` |
| networkCode | text | Yes | "" | `lib/db/src/schema/blockchain-monitoring.ts:28` |
| networkName | text | Yes | "" | `lib/db/src/schema/blockchain-monitoring.ts:29` |
| adapterKind | text | Yes | "" | `lib/db/src/schema/blockchain-monitoring.ts:30` |
| chainId | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:31` |
| providerKind | text | Optional / existing default | "none" | `lib/db/src/schema/blockchain-monitoring.ts:32` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/blockchain-monitoring.ts:33` |
| endpointSecretRef | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:34` |
| apiKeySecretRef | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:35` |
| confirmationsRequired | integer | Optional / existing default | 0 | `lib/db/src/schema/blockchain-monitoring.ts:36` |
| finalityPolicy | text | Optional / existing default | "confirmations" | `lib/db/src/schema/blockchain-monitoring.ts:37` |
| pollIntervalSeconds | integer | Optional / existing default | 15 | `lib/db/src/schema/blockchain-monitoring.ts:38` |
| maxScanRange | integer | Optional / existing default | 1000 | `lib/db/src/schema/blockchain-monitoring.ts:40` |
| lastSuccessfulScanAt | nullable timestamp | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:45` |
| healthError | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:46` |
| healthProofFingerprint | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:48` |
| healthProofCapturedAt | nullable timestamp | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:49` |
| nextAttemptAt | nullable timestamp | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:50` |
| leaseToken | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:51` |
| leaseExpiresAt | nullable timestamp | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:52` |

### blockchain_monitor_assets

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| monitorNetworkId | text | Yes | "" | `lib/db/src/schema/blockchain-monitoring.ts:92` |
| assetNetworkId | text | Yes | "" | `lib/db/src/schema/blockchain-monitoring.ts:95` |
| identityKind | text | Optional / existing default | "native" | `lib/db/src/schema/blockchain-monitoring.ts:98` |
| contractOrMint | nullable text | Optional / existing default | null | `lib/db/src/schema/blockchain-monitoring.ts:99` |
| decimals | integer | Yes | 0 | `lib/db/src/schema/blockchain-monitoring.ts:100` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/blockchain-monitoring.ts:101` |

### whitebit_provider_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| disabled | boolean | Optional / existing default | true | `lib/db/src/schema/whitebit-deposits.ts:73` |
| credentialVerifiedFingerprint | nullable text | Optional / existing default | null | `lib/db/src/schema/whitebit-deposits.ts:75` |
| credentialVerifiedAt | nullable timestamp | Optional / existing default | null | `lib/db/src/schema/whitebit-deposits.ts:76` |

### affiliate_program_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/affiliate.ts:8` |
| quickexEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/affiliate.ts:9` |
| manualEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/affiliate.ts:10` |
| commissionRate | numeric | Optional / existing default | "0.003" | `lib/db/src/schema/affiliate.ts:11` |
| minimumEligibleUsd | numeric | Optional / existing default | "0" | `lib/db/src/schema/affiliate.ts:12` |
| payoutMinimumUsd | numeric | Optional / existing default | "0" | `lib/db/src/schema/affiliate.ts:13` |
| transactionCapUsd | nullable numeric | Optional / existing default | null | `lib/db/src/schema/affiliate.ts:14` |
| cookieDurationDays | integer | Optional / existing default | 30 | `lib/db/src/schema/affiliate.ts:15` |

### notification_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| adminNotificationsEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:14` |
| adminEmailEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:15` |
| emailEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:16` |
| telegramEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:17` |
| paymentReceivedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:18` |
| processingEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:19` |
| completedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:20` |
| failedCancelledEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:21` |
| adminEmailOrderCreatedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:22` |
| adminEmailPaymentReceivedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:23` |
| adminEmailProcessingEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:24` |
| adminEmailCompletedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:25` |
| adminEmailFailedCancelledEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:26` |
| adminTelegramOrderCreatedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:27` |
| adminTelegramPaymentReceivedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:28` |
| adminTelegramProcessingEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:29` |
| adminTelegramCompletedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:30` |
| adminTelegramFailedCancelledEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:31` |
| customerEmailOrderCreatedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:32` |
| customerEmailPaymentReceivedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:33` |
| customerEmailProcessingEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:34` |
| customerEmailCompletedEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:35` |
| customerEmailFailedCancelledEnabled | boolean | Optional / existing default | false | `lib/db/src/schema/notification-settings.ts:36` |
| adminNotificationEmail | text | Optional / existing default | "" | `lib/db/src/schema/notification-settings.ts:37` |
| adminNotificationPhone | text | Optional / existing default | "" | `lib/db/src/schema/notification-settings.ts:38` |
| adminTelegramChatId | text | Optional / existing default | "" | `lib/db/src/schema/notification-settings.ts:39` |
| adminTelegramUsername | text | Optional / existing default | "" | `lib/db/src/schema/notification-settings.ts:40` |
| trustpilotReviewUrl | text | Optional / existing default | "" | `lib/db/src/schema/notification-settings.ts:41` |
| emailTemplates | jsonb | Optional / existing default | {} | `lib/db/src/schema/notification-settings.ts:42` |

### landing_background_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| mode | text | Optional / existing default | "preset" | `lib/db/src/schema/landing-backgrounds.ts:26` |
| presetId | nullable text | Optional / existing default | "neon-orbit" | `lib/db/src/schema/landing-backgrounds.ts:27` |
| customObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/landing-backgrounds.ts:28` |
| focalX | integer | Optional / existing default | 50 | `lib/db/src/schema/landing-backgrounds.ts:29` |
| focalY | integer | Optional / existing default | 50 | `lib/db/src/schema/landing-backgrounds.ts:30` |
| placements | jsonb | Optional / existing default | {} | `lib/db/src/schema/landing-backgrounds.ts:31` |

### site_nav_links

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| label | text | Yes | "" | `lib/db/src/schema/site-content.ts:174` |
| href | text | Yes | "" | `lib/db/src/schema/site-content.ts:175` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/site-content.ts:176` |
| header | boolean | Optional / existing default | false | `lib/db/src/schema/site-content.ts:177` |
| footer | boolean | Optional / existing default | false | `lib/db/src/schema/site-content.ts:178` |
| widget | boolean | Optional / existing default | false | `lib/db/src/schema/site-content.ts:179` |

### site_partner_logos

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| name | text | Yes | "" | `lib/db/src/schema/site-content.ts:188` |
| objectPath | text | Yes | "" | `lib/db/src/schema/site-content.ts:189` |
| lightObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:190` |
| darkObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:191` |
| appearance | text | Optional / existing default | "auto" | `lib/db/src/schema/site-content.ts:192` |
| sortOrder | nullable integer | Optional / existing default | null | `lib/db/src/schema/site-content.ts:193` |
| link | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:194` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/site-content.ts:195` |

### site_partner_logo_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| settings | jsonb | Yes | null | `lib/db/src/schema/site-content.ts:209` |

### site_social_trust_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| socialTitle | text | Optional / existing default | "Stay connected with us" | `lib/db/src/schema/site-content.ts:218` |
| trustTitle | text | Optional / existing default | "Share your feedback with us" | `lib/db/src/schema/site-content.ts:219` |
| instagramUrl | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:220` |
| xUrl | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:221` |
| facebookUrl | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:222` |
| telegramUrl | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:223` |
| appearance | jsonb | Yes | null | `lib/db/src/schema/site-content.ts:224` |
| trustAppearance | nullable structured JSON | Optional / existing default | null | `lib/db/src/schema/site-content.ts:225` |

### site_social_trust_links

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| group | text | Optional / existing default | "social" | `lib/db/src/schema/site-content.ts:232` |
| name | text | Yes | "" | `lib/db/src/schema/site-content.ts:233` |
| href | text | Yes | "" | `lib/db/src/schema/site-content.ts:234` |
| objectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:235` |
| lightObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:236` |
| darkObjectPath | nullable text | Optional / existing default | null | `lib/db/src/schema/site-content.ts:237` |
| appearance | text | Optional / existing default | "auto" | `lib/db/src/schema/site-content.ts:238` |
| displayMode | text | Optional / existing default | "icon-only" | `lib/db/src/schema/site-content.ts:239` |
| sortOrder | nullable integer | Optional / existing default | null | `lib/db/src/schema/site-content.ts:240` |
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/site-content.ts:241` |

### site_content_revisions

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| pageKey | text | Yes | "" | `lib/db/src/schema/site-content.ts:123` |
| content | jsonb | Optional / existing default | {} | `lib/db/src/schema/site-content.ts:126` |

### blog_automation_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| enabled | boolean | Optional / existing default | false | `lib/db/src/schema/blog.ts:133` |
| reviewFirst | boolean | Optional / existing default | true | `lib/db/src/schema/blog.ts:134` |
| publishAutomatically | boolean | Optional / existing default | false | `lib/db/src/schema/blog.ts:135` |
| scheduleAutomatically | boolean | Optional / existing default | false | `lib/db/src/schema/blog.ts:136` |
| requireTwoSources | boolean | Optional / existing default | true | `lib/db/src/schema/blog.ts:137` |
| freshnessWindowMinutes | integer | Optional / existing default | 240 | `lib/db/src/schema/blog.ts:138` |
| maxCandidatesPerRun | integer | Optional / existing default | 20 | `lib/db/src/schema/blog.ts:139` |
| cadenceUnit | text | Optional / existing default | "day" | `lib/db/src/schema/blog.ts:140` |
| articlesPerPeriod | integer | Optional / existing default | 1 | `lib/db/src/schema/blog.ts:141` |
| scheduleTimes | jsonb | Optional / existing default | [] | `lib/db/src/schema/blog.ts:142` |
| timezone | text | Optional / existing default | "UTC" | `lib/db/src/schema/blog.ts:143` |
| topics | jsonb | Optional / existing default | [] | `lib/db/src/schema/blog.ts:144` |
| categories | jsonb | Optional / existing default | [] | `lib/db/src/schema/blog.ts:145` |
| keywords | jsonb | Optional / existing default | [] | `lib/db/src/schema/blog.ts:146` |
| language | text | Optional / existing default | "en" | `lib/db/src/schema/blog.ts:147` |
| minimumArticleLength | integer | Optional / existing default | 600 | `lib/db/src/schema/blog.ts:148` |
| publicationMode | text | Optional / existing default | "review" | `lib/db/src/schema/blog.ts:149` |
| featuredImageGeneration | boolean | Optional / existing default | false | `lib/db/src/schema/blog.ts:150` |
| seoGeneration | boolean | Optional / existing default | true | `lib/db/src/schema/blog.ts:151` |
| seoIndex | boolean | Optional / existing default | true | `lib/db/src/schema/blog.ts:152` |
| seoFollow | boolean | Optional / existing default | true | `lib/db/src/schema/blog.ts:153` |
| settings | jsonb | Optional / existing default | {} | `lib/db/src/schema/blog.ts:154` |

### telegram_support_bot_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| settings | jsonb | Yes | {} | `lib/db/src/schema/telegram-support-bot.ts:5` |

### rates_xml_settings

| Field | Type | Required in new record without default? | Recommended schema default | Exact source |
|---|---|---|---|---|
| methods | jsonb | Optional / existing default | [] | `lib/db/src/schema/rates-xml.ts:7` |

## Appendix F — Database model classification

Every discovered pgTable declaration is indexed below. CORE means its schema/behavior is reusable, **not that the original company’s rows should be copied**. CUSTOMIZABLE means approved configuration only; proofs, generated delivery/state or audit identity columns in those same tables remain nonportable.

| Table | Group | Exact declaration | Copy policy |
|---|---|---|---|
| affiliate_program_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/affiliate.ts:5` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| affiliate_accounts | CORE runtime/model | `lib/db/src/schema/affiliate.ts:20` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| affiliate_completion_events | CORE runtime/model | `lib/db/src/schema/affiliate.ts:35` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| affiliate_commissions | CORE runtime/model | `lib/db/src/schema/affiliate.ts:47` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| affiliate_valuation_reviews | CORE runtime/model | `lib/db/src/schema/affiliate.ts:68` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| affiliate_payout_requests | CORE runtime/model | `lib/db/src/schema/affiliate.ts:78` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| affiliate_audit_logs | CORE runtime/model | `lib/db/src/schema/affiliate.ts:92` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blockchain_monitor_networks | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/blockchain-monitoring.ts:24` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| blockchain_monitor_assets | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/blockchain-monitoring.ts:88` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| blockchain_monitor_watches | CORE runtime/model | `lib/db/src/schema/blockchain-monitoring.ts:133` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blockchain_monitor_registration_gaps | CORE runtime/model | `lib/db/src/schema/blockchain-monitoring.ts:180` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blockchain_monitor_observations | CORE runtime/model | `lib/db/src/schema/blockchain-monitoring.ts:197` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blockchain_monitor_matches | CORE runtime/model | `lib/db/src/schema/blockchain-monitoring.ts:239` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_categories | CORE runtime/model | `lib/db/src/schema/blog.ts:21` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_articles | CORE runtime/model | `lib/db/src/schema/blog.ts:41` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_tags | CORE runtime/model | `lib/db/src/schema/blog.ts:90` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_article_tags | CORE runtime/model | `lib/db/src/schema/blog.ts:107` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_article_citations | CORE runtime/model | `lib/db/src/schema/blog.ts:116` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_automation_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/blog.ts:131` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| blog_automation_sources | CORE runtime/model | `lib/db/src/schema/blog.ts:171` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_automation_runs | CORE runtime/model | `lib/db/src/schema/blog.ts:196` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_automation_slots | CORE runtime/model | `lib/db/src/schema/blog.ts:212` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_automation_candidates | CORE runtime/model | `lib/db/src/schema/blog.ts:220` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_duplicate_topic_fingerprints | CORE runtime/model | `lib/db/src/schema/blog.ts:242` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| blog_audit_logs | CORE runtime/model | `lib/db/src/schema/blog.ts:257` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| convert_admin_notification_outbox | CORE runtime/model | `lib/db/src/schema/convert-admin-notification-outbox.ts:5` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| convert_default_pair_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/convert-default-pair.ts:6` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| convert_notification_outbox | CORE runtime/model | `lib/db/src/schema/convert-notification-outbox.ts:9` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| crypto_assets | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/crypto-assets.ts:17` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| crypto_asset_networks | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/crypto-assets.ts:43` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| whitebit_asset_mappings | CORE runtime/model | `lib/db/src/schema/crypto-assets.ts:98` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_network_mappings | CORE runtime/model | `lib/db/src/schema/crypto-assets.ts:116` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| exchange_order_audit_logs | CORE runtime/model | `lib/db/src/schema/exchange-operations.ts:12` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| exchange_provider_sync_states | CORE runtime/model | `lib/db/src/schema/exchange-operations.ts:36` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| order_support_metadata | CORE runtime/model | `lib/db/src/schema/exchange-operations.ts:54` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| fiat_currencies | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/fiat-currencies.ts:14` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| exchange_orders | CORE runtime/model | `lib/db/src/schema/index.ts:61` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| customer_status_notification_events | CORE runtime/model | `lib/db/src/schema/index.ts:176` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| exchange_customers | CORE runtime/model | `lib/db/src/schema/index.ts:223` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| customer_profiles | CORE runtime/model | `lib/db/src/schema/index.ts:233` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| customer_management_audit_logs | CORE runtime/model | `lib/db/src/schema/index.ts:243` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| landing_background_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/landing-backgrounds.ts:23` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| landing_background_audit_logs | CORE runtime/model | `lib/db/src/schema/landing-backgrounds.ts:51` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| language_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/languages.ts:4` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| manual_desk_pricing_rules | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/manual-desk-pricing-rules.ts:15` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| manual_swap_addons | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/manual-swap-addons.ts:3` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| manual_swap_fee_config | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/manual-swap-addons.ts:30` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| newsletter_subscribers | CORE runtime/model | `lib/db/src/schema/newsletter.ts:5` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| newsletter_campaigns | CORE runtime/model | `lib/db/src/schema/newsletter.ts:20` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| newsletter_deliveries | CORE runtime/model | `lib/db/src/schema/newsletter.ts:31` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| newsletter_rate_limits | CORE runtime/model | `lib/db/src/schema/newsletter.ts:52` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| notification_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/notification-settings.ts:12` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| admin_telegram_link_challenges | CORE runtime/model | `lib/db/src/schema/notification-settings.ts:50` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| desk_operators | CORE runtime/model | `lib/db/src/schema/operators.ts:15` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| team_roles | CORE runtime/model | `lib/db/src/schema/operators.ts:42` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| admin_activity_events | CORE runtime/model | `lib/db/src/schema/operators.ts:57` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| desk_operator_audit_logs | CORE runtime/model | `lib/db/src/schema/operators.ts:79` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| payment_methods | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/payment-methods.ts:60` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| fiat_currency_payment_methods | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/payment-methods.ts:89` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| provider_integrations | CORE runtime/model | `lib/db/src/schema/provider-integrations.ts:9` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| quickex_orders | CORE runtime/model | `lib/db/src/schema/quickex-orders.ts:8` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| rates_xml_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/rates-xml.ts:4` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| rates_xml_published_quotes | CORE runtime/model | `lib/db/src/schema/rates-xml.ts:14` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| site_content_revisions | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/site-content.ts:121` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| site_publication_revisions | CORE runtime/model | `lib/db/src/schema/site-content.ts:139` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| site_content_audit_logs | CORE runtime/model | `lib/db/src/schema/site-content.ts:158` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| site_nav_links | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/site-content.ts:172` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| site_partner_logos | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/site-content.ts:186` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| site_partner_logo_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/site-content.ts:207` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| site_social_trust_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/site-content.ts:216` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| site_social_trust_links | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/site-content.ts:230` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| site_contact_submissions | CORE runtime/model | `lib/db/src/schema/site-content.ts:255` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| swap_default_pair_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/swap-default-pair.ts:6` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| telegram_news_outbox | CORE runtime/model | `lib/db/src/schema/telegram-news.ts:5` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_support_bot_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/telegram-support-bot.ts:3` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| telegram_support_bot_updates | CORE runtime/model | `lib/db/src/schema/telegram-support-bot.ts:16` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_support_bot_outbox | CORE runtime/model | `lib/db/src/schema/telegram-support-bot.ts:32` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_chats | CORE runtime/model | `lib/db/src/schema/telegram.ts:12` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_account_link_challenges | CORE runtime/model | `lib/db/src/schema/telegram.ts:27` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_wizard_sessions | CORE runtime/model | `lib/db/src/schema/telegram.ts:40` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_order_links | CORE runtime/model | `lib/db/src/schema/telegram.ts:52` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_processed_updates | CORE runtime/model | `lib/db/src/schema/telegram.ts:65` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| telegram_notification_outbox | CORE runtime/model | `lib/db/src/schema/telegram.ts:76` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| website_branding_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/website-branding.ts:5` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| whitebit_deposit_addresses | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:16` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_order_addresses | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:44` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_api_nonce | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:66` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_provider_settings | CUSTOMIZABLE configuration contract + CORE validation | `lib/db/src/schema/whitebit-deposits.ts:71` | Configure anew or import an explicit sanitized allowlist; remove original wallets/contact identities and all generated proofs. |
| whitebit_history_checkpoints | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:89` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_order_history_checkpoints | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:96` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_history_worker_state | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:104` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_webhook_deliveries | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:121` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_deposits | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:138` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
| whitebit_ledger_entries | CORE runtime/model | `lib/db/src/schema/whitebit-deposits.ts:178` | Schema only. Do not clone original customer/financial/delivery/session/audit/operational rows. |
