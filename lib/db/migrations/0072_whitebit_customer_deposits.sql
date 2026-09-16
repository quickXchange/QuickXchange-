CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS whitebit_api_nonce (
  id integer PRIMARY KEY CHECK (id = 1),
  last_nonce numeric NOT NULL
);
CREATE TABLE IF NOT EXISTS whitebit_deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL REFERENCES exchange_customers(id) ON DELETE CASCADE,
  ticker text NOT NULL, provider_ticker text NOT NULL, network text NOT NULL DEFAULT '', address text, memo text,
  status text NOT NULL DEFAULT 'pending', claim_token uuid DEFAULT gen_random_uuid(),
  provider_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whitebit_address_customer_asset_uq UNIQUE (customer_id, ticker, network)
);
CREATE INDEX IF NOT EXISTS whitebit_address_lookup_idx ON whitebit_deposit_addresses(address, memo);
CREATE TABLE IF NOT EXISTS whitebit_history_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid NOT NULL REFERENCES whitebit_deposit_addresses(id) ON DELETE CASCADE,
  high_water_identity text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whitebit_history_checkpoint_address_uq UNIQUE (address_id)
);
CREATE TABLE IF NOT EXISTS whitebit_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), envelope_id text NOT NULL UNIQUE,
  nonce numeric NOT NULL UNIQUE, method text NOT NULL, payload jsonb NOT NULL, payload_digest text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS whitebit_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text REFERENCES exchange_customers(id) ON DELETE SET NULL,
  address_id uuid REFERENCES whitebit_deposit_addresses(id) ON DELETE SET NULL,
  ticker text NOT NULL, provider_ticker text NOT NULL, network text, address text NOT NULL, memo text,
  amount numeric NOT NULL, fee numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'unknown',
  provider_status integer, transaction_hash text, unique_id text, transaction_id text,
  envelope_id text, payload_digest text, provider_identity text NOT NULL, superseded_by uuid,
  provider_created_at timestamptz, confirmations_actual integer, confirmations_required integer,
  raw_payload jsonb, credited_at timestamptz, conflict text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whitebit_deposit_identity_uidx ON whitebit_deposits(provider_identity);
CREATE INDEX IF NOT EXISTS whitebit_deposit_customer_created_idx ON whitebit_deposits(customer_id, created_at);
CREATE INDEX IF NOT EXISTS whitebit_deposit_address_idx ON whitebit_deposits(address);
CREATE TABLE IF NOT EXISTS whitebit_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL REFERENCES exchange_customers(id) ON DELETE RESTRICT,
  ticker text NOT NULL, amount numeric(39,18) NOT NULL, source_key text NOT NULL UNIQUE,
  deposit_id uuid REFERENCES whitebit_deposits(id) ON DELETE RESTRICT,
  description text NOT NULL DEFAULT 'WhiteBIT deposit', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whitebit_ledger_customer_ticker_idx ON whitebit_ledger_entries(customer_id, ticker);
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS provider_ticker text;
UPDATE whitebit_deposits SET provider_ticker = ticker WHERE provider_ticker IS NULL;
ALTER TABLE whitebit_deposits ALTER COLUMN provider_ticker SET NOT NULL;
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS provider_created_at timestamptz;
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS confirmations_actual integer;
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS confirmations_required integer;
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS superseded_by uuid;
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS payload_digest text;
ALTER TABLE whitebit_deposits ADD COLUMN IF NOT EXISTS conflict text;
ALTER TABLE whitebit_webhook_deliveries ADD COLUMN IF NOT EXISTS payload_digest text;
UPDATE whitebit_webhook_deliveries SET payload_digest = encode(digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex') WHERE payload_digest IS NULL;
ALTER TABLE whitebit_webhook_deliveries ALTER COLUMN payload_digest SET NOT NULL;
DO $$
BEGIN
  IF to_regclass('public.whitebit_deposits') IS NOT NULL AND
     (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'whitebit_deposits'
        AND column_name IN ('provider_identity','transaction_id','envelope_id','provider_ticker','payload_digest')) <> 5 THEN
    RAISE EXCEPTION 'Incompatible partial whitebit_deposits schema; manual reconciliation required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_deposits_unique_id_key') THEN
    ALTER TABLE whitebit_deposits DROP CONSTRAINT whitebit_deposits_unique_id_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_deposit_amount_positive') THEN
    ALTER TABLE whitebit_deposits ADD CONSTRAINT whitebit_deposit_amount_positive CHECK (amount = amount AND fee = fee AND amount > 0 AND fee >= 0 AND amount < 100000000000000000000000000000000000 AND fee < 100000000000000000000000000000000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_confirmation_valid') THEN
    ALTER TABLE whitebit_deposits ADD CONSTRAINT whitebit_confirmation_valid CHECK (confirmations_actual IS NULL OR (confirmations_actual >= 0 AND confirmations_required IS NOT NULL AND confirmations_required >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_status_valid') THEN
    ALTER TABLE whitebit_deposits ADD CONSTRAINT whitebit_status_valid CHECK (status IN ('accepted','updated','processed','unknown'));
  END IF;
END $$;
ALTER TABLE whitebit_deposit_addresses ALTER COLUMN ticker TYPE text;
ALTER TABLE whitebit_deposit_addresses ADD COLUMN IF NOT EXISTS provider_ticker text;
UPDATE whitebit_deposit_addresses SET provider_ticker = ticker WHERE provider_ticker IS NULL;
ALTER TABLE whitebit_deposit_addresses ALTER COLUMN provider_ticker SET NOT NULL;
ALTER TABLE whitebit_deposits ALTER COLUMN amount TYPE numeric(39,18);
ALTER TABLE whitebit_deposits ALTER COLUMN fee TYPE numeric(39,18);
ALTER TABLE whitebit_ledger_entries ALTER COLUMN amount TYPE numeric(39,18);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_ledger_amount_valid') THEN
    ALTER TABLE whitebit_ledger_entries ADD CONSTRAINT whitebit_ledger_amount_valid
      CHECK (amount = amount AND amount > 0 AND amount < 100000000000000000000000000000000000);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION whitebit_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'whitebit ledger entries are immutable'; END $$;
DROP TRIGGER IF EXISTS whitebit_ledger_immutable_trigger ON whitebit_ledger_entries;
CREATE TRIGGER whitebit_ledger_immutable_trigger BEFORE UPDATE OR DELETE ON whitebit_ledger_entries
FOR EACH ROW EXECUTE FUNCTION whitebit_ledger_immutable();