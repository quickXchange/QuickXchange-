# Automated deposit-provider assignment

## Owner workflow

Open **Admin → Crypto Networks → Bulk Assign Deposit Provider**, select exact
asset/network rows and a registered provider, then review the mappings.
**Confirm Assignment** authorizes the complete operation. WhiteBIT requires
affirmative consent to real address-permission checks; these can create a
provider verification address, never an exchange order or payout.

Each selected route has independently persisted progress:

1. Snapshot its original Customer Deposits state before mutation.
2. Disable new customer deposits.
3. Save the reviewed provider and exact mapping using existing assignment checks.
4. Verify using the existing provider authority:
   - **WhiteBIT:** live signed credential test, exact-route address permission,
     current configuration proof and widget eligibility.
   - **Manual:** valid saved wallet/memo and live RPC readiness when automatic
     tracking is configured. Manual-only tracking-OFF settings remain OFF;
     they are not represented as RPC verification.
   - **None:** intentionally remove the provider and leave deposits OFF.
5. Restore ON only if the route was originally ON and verification passed.
6. Read back the actual saved provider, mapping and deposit state.

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
  - Returns the saved job; the job id equals `operationId`.
  - Replaying the same id and configuration is idempotent, even after completion.
    Changing its configuration or authorizing Owner returns a conflict.
- `GET /api/admin/crypto-networks/deposit-provider/jobs/{jobId}`
  - Returns current per-route status, step, error, original/current deposit
    flags, saved provider and attempt count.
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
