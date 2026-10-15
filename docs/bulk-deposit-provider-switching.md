# Automated deposit-provider assignment

## Owner workflow

Open **Admin → Crypto Networks → Bulk Assign Deposit Provider**, select exact
asset/network rows and a registered provider, then review the mappings.
**Confirm Assignment** authorizes the complete operation. WhiteBIT requires
affirmative consent to real address-permission checks; these can create a
provider verification address, never an exchange order or payout.

The same drawer includes **RPC Monitoring**, **Network Monitor** and **Asset
Monitoring**. RPC Monitoring defaults to **Automatic (selected provider)**;
the other two default to **Follow RPC Monitoring**. Each also offers Enable,
Disable and Keep Current. Keep Current preserves that setting; it is not an
alias for Automatic. Explicit Network/Asset choices override the automatic
plan, but cannot bypass obligation protection.

Each selected route has independently persisted progress:

1. Snapshot its original Customer Deposits state before mutation.
2. Disable new customer deposits. Enhanced jobs quiesce all accepted selected
   routes together before processing, so queued routes cannot acquire new
   Manual obligations while a shared Network Monitor is being changed.
3. Save the reviewed provider and exact mapping using existing assignment checks.
4. Configure monitoring, then verify using the existing provider authority:
   - **WhiteBIT:** live signed credential test, exact-route address permission,
     current configuration proof and widget eligibility.
   - **Manual:** Automatic enables route tracking, its exact asset monitor and
     Network Monitor, then probes the configured RPC and saves its fenced
     exact-route readiness proof before evaluating deposit eligibility.
     Keep preserves settings but cannot grant deposit readiness to an
     unmonitored route. Explicitly disabling Manual monitoring intentionally
     leaves Customer Deposits OFF, even if originally ON; this is not
     represented as successful RPC verification.
   - **None:** intentionally remove the provider and leave deposits OFF.
   - **WhiteBIT automatic monitoring:** stops unnecessary per-route polling,
     without probing RPC solely for WhiteBIT verification. Required asset or
     shared network monitors remain enabled for old Manual obligations.
5. Restore ON only if the route was originally ON and verification passed.
6. Read back the actual saved provider, mapping, RPC tracking, Network Monitor,
   Asset Monitoring, RPC status and Customer Deposits state.

An explicit shutdown conflicting with active watches, confirming/review/recent
applied evidence, or eligible legacy deposits (including missing watches) fails
safely. No watch, cursor, observation or funding snapshot is deleted. A shared
network can stay ON for other routes while the selected asset monitor is OFF.
Both polling and shutdown checks use the existing worker's workload authority.
Individual Network/Asset controls also enforce the shutdown guards.

Failures remain safely OFF with a specific public error code/reason and a
per-route retry. A route already owned by another operation is **not started**;
its conflict is reported without interrupting that operation or blocking the
remaining selection. A failed retry never converts an original OFF into ON.

The drawer shows persisted progress about once per second, partial success and
a final summary. Closing it does not cancel server work. Its user-scoped saved
operation can be resumed after reload, including a lost create response. A
transient connection failure does not discard its operation ID.

## API

All endpoints require the existing Owner permission and trusted authentication/
second-factor boundaries. Operator permission overrides do not grant access.
The OpenAPI contract and generated clients are the source of truth.

- `POST /api/admin/crypto-networks/deposit-provider/jobs`
  - Existing assignment input: `networkIds`, `depositProvider`, `reviewToken`,
    optional `whitebitMappings`.
  - Additionally: `operationId` (stable unique id), and
    `confirmRealAddressCreation: true`.
  - Optional `monitoring`: `rpcMonitoring`, `networkMonitor`,
    `assetMonitoring`, each `auto | enable | disable | keep`.
    The RPC field's auto is provider-aware; the other fields' auto follows it.
    Omitting the object preserves legacy callers/jobs. Supplied-object defaults
    are auto. Monitoring intent is part of the idempotency digest and persisted
    with the operation, so retry/reload never silently changes it.
  - Returns the saved job; the job id equals `operationId`.
  - Replaying the same id and configuration is idempotent, even after completion.
    Changing its configuration or authorizing Owner returns a conflict.
- `GET /api/admin/crypto-networks/deposit-provider/jobs/{jobId}`
  - Returns current per-route status, step, error, original/current deposit
    flags, saved provider and attempt count.
  - Also returns actual monitoring flags, a monitoring explanation, and status
    `ACTIVE`, `IDLE`, `OFF`, `BLOCKED`, `NOT_CONFIGURED` or
    `PRESERVED_FOR_OBLIGATIONS` (or `AMBIGUOUS` for conflicting exact mappings).
    Enabled flags alone do not claim a live healthy
    RPC connection.
- `POST /api/admin/crypto-networks/deposit-provider/jobs/{jobId}/retry`
  - Body: `networkId`, `confirmRealAddressCreation: true`.
  - Only failed work is queued. Repeated requests do not restart successful work.

The original assignment-only and individual verification/toggle controls remain
available. The automation calls their shared service functions, not fabricated
HTTP requests or elevated identities.

## Reliability and safety

- Two route workers per server process; no pooled DB connection is held merely
  to own a bulk worker while waiting on network IO.
- Active-route uniqueness, atomic claims, renewable leases and token fences
  prevent overlapping operations and obsolete workers enabling deposits.
- The authorizing Owner must remain active with the same authorization version.
- Applicable catalog editing is blocked while a route is claimed.
- Queued work is recovered periodically after restart. Expired in-flight work
  becomes visibly interrupted and OFF; external address creation is not blindly
  replayed. Owner-confirmed retry reuses an exact proof already committed.
- Proof invalidation is per-route. A new operation does not silently trust an old
  address-permission proof. Retries do not invalidate their newly committed proof.
- Audits record authorization, configuration changes, completion and failure.
- No credentials, addresses, customer identities or balances are stored in the
  progress response/browser request journal.
- Existing order funding snapshots, assigned deposit addresses, monitoring
  watches, provider reconciliation, fees and financial processing are unchanged.
  Independent obligations still prevent unnecessary-monitor retirement.

## Schema and release

Development migrations were applied and tested. Production was not modified.
Apply the normal application-managed release migrations before running the new
server in Production:

- `0147_elite_lethal_legion.sql`: durable jobs/routes and active-route uniqueness.
- `0148_greedy_dust.sql`: authorization-version and verification-start fencing.
- `0149_worthless_maximus.sql`: optional persisted monitoring intent and
  per-route monitoring explanations. Existing journals remain compatible.

The new tables are operational journals, not financial ledgers. No existing
customer/order data is converted, deleted or reassigned by these migrations.
Do not assume that publishing automatically runs application-managed migrations;
use the project's existing migration release entrypoint.

## Verification

Isolated API tests use synthetic credentials, addresses and intercepted provider
responses; no live provider orders, payouts or customer messages are involved.
They cover partial success, live permission denial, original ON/OFF retention,
duplicate create/retry protection, Owner-only access, configuration preservation,
financial-record hashes, Manual/None handling and interrupted verification.
Browser tests use isolated E2E API fixtures rather than live Admin mutations.
The extended tests also exercise real Bitcoin adapter calls against intercepted
synthetic RPC responses, reversible Manual/WhiteBIT switching, retained provider
configuration, explicit enable/disable/keep controls, missing-watch obligations,
active watches, pending confirmations and retry after obligations are cleared.
