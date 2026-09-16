-- Keep ownership and exceptional mutation rights separate from the application
-- role. Both roles are NOLOGIN so they can only be assumed deliberately by a
-- database administrator.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'quickex_app_runtime'
  ) THEN
    CREATE ROLE quickex_app_runtime
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE quickex_app_runtime
      LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'quickex_order_audit_owner'
  ) THEN
    CREATE ROLE quickex_order_audit_owner NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'quickex_order_audit_maintenance'
  ) THEN
    CREATE ROLE quickex_order_audit_maintenance NOLOGIN NOINHERIT;
  END IF;
END;
$$;

-- The migration identity temporarily needs owner membership so this migration
-- remains replayable after ownership has been separated.
GRANT quickex_order_audit_owner TO CURRENT_USER;

CREATE OR REPLACE FUNCTION prevent_exchange_order_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'quickex_order_audit_maintenance' THEN
    RAISE EXCEPTION 'exchange_order_audit_logs is append-only'
      USING ERRCODE = '55000',
            HINT = 'Exceptional maintenance requires the quickex_order_audit_maintenance role.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS exchange_order_audit_append_only ON exchange_order_audit_logs;

CREATE TRIGGER exchange_order_audit_append_only
BEFORE UPDATE OR DELETE ON exchange_order_audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_exchange_order_audit_mutation();

ALTER TABLE exchange_order_audit_logs OWNER TO quickex_order_audit_owner;
ALTER FUNCTION prevent_exchange_order_audit_mutation()
  OWNER TO quickex_order_audit_owner;

REVOKE ALL ON TABLE exchange_order_audit_logs FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format(
    'GRANT USAGE ON SCHEMA %I TO quickex_app_runtime',
    current_schema()
  );
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO quickex_app_runtime',
    current_schema()
  );
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO quickex_app_runtime',
    current_schema()
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO quickex_app_runtime',
    current_schema()
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO quickex_app_runtime',
    current_schema()
  );
  EXECUTE format(
    'GRANT USAGE ON SCHEMA %I TO quickex_order_audit_maintenance',
    current_schema()
  );
END;
$$;
REVOKE UPDATE, DELETE ON TABLE exchange_order_audit_logs
  FROM quickex_app_runtime;
GRANT SELECT, UPDATE, DELETE ON TABLE exchange_order_audit_logs
  TO quickex_order_audit_maintenance;

REVOKE quickex_order_audit_owner FROM CURRENT_USER;