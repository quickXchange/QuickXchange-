# Admin notification inbox

The header bell and **Admin → Notifications** display real backend events. The existing **Notification Settings** page continues to manage external email/Telegram delivery; disabling those channels does not hide the in-app operational inbox.

## Behavior

- Swap creation and canonical status changes; Convert creation, reconciliation, recovered submissions, and Admin status changes.
- Confirmed deposits require the existing immutable funding evidence (Swap) or validated provider-paid amount (Convert). A status label alone must never claim funds arrived.
- Failed/cancelled/expired/refunded orders use neutral attention messages, not an unsupported claim that a payment occurred.
- Quickex reconciliation errors, WhiteBIT history errors, RPC health failures, provider API errors and internal API failures generate sanitized operational alerts.
- Stable event identities prevent duplicate order/deposit alerts. Operational errors are coalesced into 15-minute windows with bounded in-process suppression and database uniqueness across instances.
- No bank details, wallet addresses, credentials, raw provider URLs/errors, customer names, or email addresses are stored in inbox messages.
- Events start with this release; there is no fabricated historical backfill.

## Access and state

All endpoints use existing operator authentication and MFA. Owners see all alerts. Other active operators see order events only with `orders.view`; system/provider events require `integrations.view` or `blockchain_monitoring.view`.

Read and deleted states are **per operator**. Deleting hides an alert only for that operator; the shared event remains to preserve deduplication. Mark All Read never makes an event visible again after deletion.

The central Admin route policy explicitly classifies all four inbox endpoints as authenticated operator access (GET is read-only). Receipt writes are personal, not permission to edit orders, notification delivery settings, or other operators. Existing domain permissions still filter every list, count and write inside the inbox router; unavailable event IDs return 404. Unknown methods and paths remain denied by default. Loading/failed requests display unknown counts, never a fabricated zero or stale successful count.

Lists are paginated (20 per page), no-store, and permission-scoped before counts and pagination. The UI refreshes every 15 seconds, on focus/mount, and after mutations. Cache keys include the signed-in identity.

## API

All paths are relative to `/api`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/notifications?filter=all|read|unread&page=1` | Items and global visible read/unread/total counts |
| POST | `/admin/notifications/read-all` | Mark this operator's currently visible events read |
| POST | `/admin/notifications/:id/read` | Mark one visible event read |
| DELETE | `/admin/notifications/:id` | Dismiss one visible event for this operator |

The OpenAPI specification and generated clients contain the response contracts. Invalid filters/IDs return 400; unavailable or inaccessible IDs return 404 without exposing their existence.

## Migration and verification

Migration `0151_confused_crusher_hogan.sql` adds only `admin_inbox` and `admin_inbox_receipts` with uniqueness, foreign key and list/receipt indexes. Applied to Development; **not applied to Production by this work**. Production requires the existing approved release/migration process before running this version.

Checks:

- `pnpm --filter @workspace/api-server run test:admin-inbox` — isolated PostgreSQL lifecycle, permissions, deduplication, per-operator state, rollback and pagination tests.
- `pnpm --filter @workspace/api-server run test:manual-buy` — real isolated order creation/replay/Admin/tracking with inbox events and status-only payment-evidence safeguards.
- `pnpm exec playwright test e2e/admin-notifications.spec.ts` — existing E2E auth harness, synthetic browser API fixtures, light/dark desktop/mobile and interactive workflows. No live orders or customer records.

Browser coverage uses fixtures; actual persistence/authentication middleware is separately verified by the database-backed API suites. Live Owner/MFA browser login was not available during verification. No authentication controls were weakened.
