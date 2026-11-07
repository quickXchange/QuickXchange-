# QuickChange partner demo: implementation and isolation plan

## Status and deployment boundary

Architecture inspection is complete. This is a plan, not a deployed demo.
No application code, database, credentials, DNS, or deployment was changed to
prepare this document.

Replit publishes the artifacts within a project together. Adding another
artifact here would not provide the independent publication boundary requested.
The public partner demo therefore belongs in a separate Replit project with
its own database, authentication realm, storage, secrets and deployment.
Do not publish this operational project to launch the demo.

## Existing architecture inspected

| Area | Existing implementation | Demo treatment |
|---|---|---|
| Website | React/Vite, Wouter, React Query; `artifacts/crypto-exchange-widget/src/App.tsx` and its existing pages/components | Copy reusable source into the independent project; preserve layout, branding, responsive styles and Light/Dark themes. |
| Mini App | Separate frontend in `artifacts/quickxchange-telegram-mini-app` using the shared backend | Reuse screens against demo services; provide a browser-compatible simulated Telegram context. |
| API | Express/TypeScript; `artifacts/api-server/src/app.ts` and `src/routes` | Separate demo entrypoint and explicitly allowed routes. Do not start the original server in demo mode. |
| Persistence | Drizzle/PostgreSQL models in `lib/db/src/schema` and migrations | New database provisioned independently, populated exclusively by authored fictional fixtures. |
| Identity | Clerk in the Website and Express middleware; application operator roles and permissions | Dedicated anonymous demo sessions/personas, never production Clerk users, cookies, roles or keys. |
| Operational workers | `artifacts/api-server/src/index.ts` starts reconciliation, blockchain, WhiteBIT, Telegram, newsletter, XML and Revenue workers | Never boot this entrypoint in the demo. Register only isolated simulation and reset workers. |
| Providers | Quickex V2, WhiteBIT, 1Forge, RPC/Alchemy and reference market sources | Deterministic simulation adapters implementing the existing contracts; no live credentials or network actions. |
| Communications | Telegram exchange/support/news bots, Resend, contact/newsletter delivery | In-app message previews and local command simulations only. No external messages or live webhooks. |
| Financial logic | Existing exact-amount arithmetic, quotes, pricing, lifecycle and accounting structures | Reuse safe pure calculation modules and contracts with synthetic settings; never import operational settings or execute provider settlement. |

Additional feature and routing inventory already exists in
`WHITELABEL_BLUEPRINT.md`; use it as an implementation checklist, not as a source
of production data to copy.

## Non-negotiable safety controls

1. Separate project and independently provisioned database. Do not clone a live
   database, customer rows, encrypted credential rows, queues, monitoring
   checkpoints, object-storage buckets or authentication accounts.
2. Source-only transfer with explicit file allowlists. Exclude `.env`, credentials,
   private uploads, logs, database exports, caches and Git history. Scan the
   resulting package; review hardcoded defaults before including them.
3. A demo-only server that cannot import production bootstrap modules.
   No fallback from demo database configuration to an operational connection.
4. Bootstrap must refuse a nonempty database without the expected demo marker;
   accidental configuration must not initialize or migrate an existing exchange.
5. Provider adapters are selected server-side and locked to simulation.
   Reject attempts to activate live providers, supply real keys, register external
   webhooks, transfer funds or send external notifications.
6. Use non-fundable demo payment identifiers and clearly watermarked QR payloads.
   Never display production wallets or give visitors an address they might fund.
7. Persistent "Demo — simulated funds, rates and messages" labeling on all
   financial screens, instructions, receipts and integration tests.
8. Do not accept real payment credentials, passwords, identity documents or
   production API keys. Disable sensitive uploads with an explanation.
9. Anonymous demo sessions are not real Owner/Admin accounts. A sandbox Admin
   persona can manage fictional records only; credentials, security policy and
   deployment/source-management controls remain unavailable.
10. Fail closed for unsupported operations rather than silently forwarding them
    to the original API. Automated tests must prove zero external side effects.

## Visitor isolation and persistence

- Issue a cryptographically random session identity on the demo server. Do not
  trust a session/tenant ID supplied in a form or URL.
- Scope every mutable record, lookup, aggregate, notification and setting to that
  visitor's demo session. Apply database row-level protections with a restricted
  runtime role; never use table-owner credentials for public requests.
- Seed one independent fictional workspace per visitor. Keep the immutable
  seed/template inaccessible to visitor updates.
- Provide Reset My Demo, affecting only the caller's workspace.
- Expire workspaces after 24 hours; perform cleanup and restoration without
  touching another active visitor. Bound sessions and records per session.
- Rate-limit session creation, writes, quotes and resets; cap request sizes and
  uploaded content. Add bounded retention and resource limits.
- Test ID guessing, forged session identifiers, cross-session filters and
  concurrent writes explicitly.

## Feature acceptance inventory

| Surface | Required interactive demo coverage |
|---|---|
| Public Website | Existing landing pages, navigation, selectors, search, content, FAQ, blog, manual, policies, footer and theme/language switching. |
| Swap / Buy / Sell | Fiat-to-crypto, crypto-to-fiat and other supported directions; existing selectors and calculation behavior using fictional route settings. |
| Convert | Fixed/Floating simulated quotes, quote expiration, source/target amounts, form validation, order creation and tracking. |
| Instructions | Clearly simulated address, memo and QR presentation, payment details and confirmation controls, with no fundable destination. |
| Customer account | Sample profile, history, order detail, invoices and notifications; each visitor sees only their demo records. |
| Admin overview | Populated order counts, charts, financial summaries, notifications and recent activity calculated from that visitor's sample data. |
| Catalogs and pricing | Assets, networks, banks/payment methods, search, filters, selection and supported bulk actions against session-local records. |
| Admin order operations | Search, pagination, View Order, Copy Info using fictional payout fields, simulated lifecycle changes and corresponding customer updates. |
| Revenue | My Rates, completed-only accounting, frozen completion snapshots, per-order overrides, fee previews, missing-cost states and currency-separated totals. |
| Content and branding | Safe session-local branding/text/theme changes; no production publication or shared settings mutation. |
| Integrations/monitoring | Simulated connection tests, readiness, deposits, confirmations, failures and recovery; all results explicitly labeled simulated. |
| Telegram | Browser-based exchange/support command simulator plus Mini App screens sharing the visitor's demo orders; no live bots or messages. |
| Security/settings | Explain protected capabilities; block real operator management, secrets, external delivery, deployment and source-management access. |

The implementation must maintain a feature matrix separating working simulated
workflows, intentionally read-only features, and anything not yet implemented.
Do not label an unimplemented route or static screenshot "fully functional."

## Fictional seed dataset

Create sample personas with reserved example-domain email addresses; sample
Swap/Convert orders covering awaiting funds, processing, completed, failed and
cancelled states; local notifications; route/catalog fixtures; synthetic
acquisition rates and fees; completed-order accounting; example content and
activity history.

Generate coherent relative timestamps and calculate dashboards from actual
demo rows. A simulated deposit must update the same order and accounting
records shown in Admin, tracking and Mini App. Repeated simulation events must
not double-credit, double-complete or duplicate notifications.

Preserve the current supported language scope: English, French, German,
Russian, Spanish, Korean and Ukrainian. Reuse the existing translation
system, not a parallel dictionary architecture.

## Vynox integration

- Publish the new demo project to its own public URL; verify that URL after
  publication rather than inventing one.
- Vynox can link with a View Live Demo button. Open new tabs using
  `rel="noopener noreferrer"`.
- Default `Content-Security-Policy: frame-ancestors 'self'`. Add only the
  actual Vynox HTTPS origin(s) after they are supplied and reviewed. Never
  allow arbitrary framing with `*`.
- Keep CORS restricted to explicit needs; framing is not a reason to expose the
  API to every origin.
- Validate both origin and message schema for any `postMessage` integration;
  never send credentials, session tokens or customer information to the parent.
- Test Safari/Chrome iframe storage restrictions. Provide a direct-open
  fallback when third-party storage is blocked; do not weaken production
  authentication or promise universal iframe compatibility.
- Keep branding in demo configuration so Vynox can later adapt the presentation
  without hardcoded company identities in new components.

## Implementation sequence

1. Establish the separate project and source-transfer path before making a
   deployment-related change here.
2. Prepare and scan the reusable source-only package and dependency manifests.
3. Create the demo-only boot entrypoints, independently provision persistence,
   implement session isolation, seed/reset, and side-effect-denial tests first.
4. Connect existing frontend screens through simulation adapters using the
   existing request/response contracts. Implement vertical exchange flows
   before expanding settings and catalog CRUD.
5. Add realistic sample history and derive charts/reports/notifications from
   the same dataset.
6. Verify customer/Admin/Mini App order synchronization and local Telegram
   simulations. Make sensitive settings explicitly read-only.
7. Verify desktop, tablet, phone, Light/Dark, supported languages, simultaneous
   visitors, resets, iframe policies and zero external calls.
8. Run type checks, production builds and relevant automated regression suites
   in the demo project. Publish that project only through its publishing flow.
9. Return the verified public URL, access/reset instructions, feature matrix,
   Vynox embed example and evidence that the original deployment was untouched.

## Acceptance gates before calling the demo complete

- A public visitor can open the independent deployment without a production
  account.
- Two visitors can mutate and reset their workspaces without observing or
  modifying each other's state.
- Core Swap and Fixed/Floating Convert creation, Admin visibility, tracking and
  simulated completion work end to end.
- Sample statistics and accounting reconcile to the demo orders.
- Quotes, deposits, messages and provider tests are visibly simulations.
- Direct API attempts cannot invoke payments, messaging or production settings.
- The package and published browser bundle contain no production secrets or
  private records.
- No production database, deployment, DNS, wallet configuration, live integration
  or existing application functionality was changed.

## Required external handoff

The tools available in this conversation cannot create another Replit project
or publish it autonomously. A separate empty project must be opened for the
demo, and publication requires the user's Publish action. Do not substitute
publishing this live exchange project.

The actual Vynox HTTPS origin is also needed before enabling embedded access.
Direct demo access can be implemented and tested before that origin is known.
