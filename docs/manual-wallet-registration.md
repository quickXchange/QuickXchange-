# Manual wallet registration in Set Wallet Address

## Owner workflow

Use the existing **Crypto Networks → Set Wallet Address** action for one or more selected routes. Review the proposed address/memo before saving. Provider assignments, exact WhiteBIT mappings and fallback preferences are preserved.

- **Manual:** Save the Manual address, activate the required exact network/asset monitors, and verify the live RPC connection. Customer Deposits can be enabled only after verification succeeds. A failure retains the valid address and explains why deposits remain OFF.
- **WhiteBIT:** Save a standby Manual registration without probing or polling RPC merely because a backup address exists. Explicitly enabled Manual fallback and historical financial obligations remain protected.
- **Switch back:** The existing Assign Deposit Provider action synchronizes the registration, activates the required monitoring and verifies readiness. Originally disabled customer deposits remain disabled.

Address syntax, network compatibility and required memo/tag syntax are validated before the save transaction commits. Exact monitor mappings, configured token identity and decimals are checked; absent configuration is reported, never invented. Invalid input rolls back the address change. Transport/configuration verification failures do not discard a valid saved wallet.

The preview is read-only: PLANNED is not a successful live verification.

## Shared registrations versus financial watches

A configuration target is unique to the monitor network, canonical address and memo. Compatible tokens such as BNB, USDT and USDC on BEP20 share that target, with distinct exact asset registrations and token identities. EVM casing and supported TRON address representations normalize for identity. Different monitor networks and memos remain distinct.

These are not synthetic orders or replacement payment watches. The existing order engine still creates each immutable order-owned financial watch when an order receives its address. Updating a configuration never changes a frozen order address, merges different orders, deletes an old target or removes an obligated watch. Existing workload protections continue to retain monitoring for pending payments, confirmations, reorg checks and recoverable legacy orders.

Batch wallet verification shares a network probe across tokens. Publication of both the fingerprint and captured timestamp is fenced against current configuration, fresh network health and current Owner authorization. A concurrent provider assignment blocks the wallet operation rather than allowing competing writes.

## Admin result states

- `READY`: exact active Manual monitoring proof is currently valid.
- `STANDBY`: Manual registration exists while another provider is active; this is not RPC readiness.
- `BLOCKED`: missing configuration, invalid configured identity or unsuccessful live verification.
- `OUT_OF_SYNC`: saved address or exact RPC identity no longer matches its registration.
- `NOT_REGISTERED`: no configuration registration exists yet.

The saved address and registration status are shown in the existing result cards and network Name cell. Customer Deposits status remains separate. Retry a blocked route through Set Wallet Address after correcting the displayed configuration issue, or through the existing provider assignment workflow. No Manage RPC action is added.

## Release and verification

Migration `0150_redundant_satana.sql` creates configuration targets and asset-route registrations. The 2026-10-15 read-only integration review verified that Production already has its exact columns, defaults, validated foreign keys and valid indexes, matching Development. Its Drizzle journal hash is absent, so do not infer pending DDL from that journal or replay the raw CREATE statements. Managed Publish owns schema reconciliation; check its diff before any release.

Wallet verification and provider-job admission are mutually exclusive for overlapping routes, including the interval after temporary deposit disablement and before RPC verification finishes. Duplicate wallet submissions fail fast. Control-session locks do not hold an SQL transaction or occupy a shared application-pool slot during RPC. Ending the control session releases its locks. A lost control session fails subsequent activation fences closed.

For a code rollback, stop new bulk actions, allow existing durable jobs to complete, and return to the selected prior application release while retaining both additive tables and all financial/configuration data. Application rollback does not undo provider/address settings. Review configuration through Owner controls if restoration is needed; never restore an old database merely to undo this code release.

Verification uses disposable database fixtures and mocked provider/RPC responses, plus desktop/mobile browser API fixtures. No live customer order, deposit, payout, message or Production configuration is created or changed by these tests.
