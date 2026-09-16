# Order audit append-only enforcement

`exchange_order_audit_logs` accepts application inserts and reads, but its table
owner is the non-login `quickex_order_audit_owner` role. The API authenticates
as the non-admin `quickex_app_runtime` login, which has no `UPDATE` or `DELETE`
grant and cannot create roles or assume the maintenance role. A trigger also
rejects mutations unless the active role is `quickex_order_audit_maintenance`.

Application order mutations can therefore continue to append audit events in
their existing transactions without receiving history-mutation authority.

## Exceptional maintenance bypass

Use the bypass only for test cleanup or an approved exceptional repair. It must
be transaction-local so it cannot leak into later work on a pooled connection:

```sql
BEGIN;
SET LOCAL ROLE quickex_order_audit_maintenance;
DELETE FROM exchange_order_audit_logs WHERE order_id = 'approved-order-id';
COMMIT;
```

Only a database administrator should be allowed to assume the non-login
maintenance role. Keep the predicate narrowly scoped, use `SET LOCAL ROLE` so
authority ends at commit, and never grant this role to the application role.

Database migrations run separately through `pnpm --filter @workspace/db run
migrate`, using the managed `DATABASE_URL`. The API never runs migrations at
startup and uses `APP_DATABASE_PASSWORD` only with the restricted runtime login.