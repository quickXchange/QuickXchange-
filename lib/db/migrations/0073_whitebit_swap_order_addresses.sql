-- Additive WhiteBIT Swap funding state. Safe to apply after 0072 or reapply.
CREATE TABLE IF NOT EXISTS "whitebit_order_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" text NOT NULL,
  "ticker" text NOT NULL,
  "provider_ticker" text NOT NULL,
  "network" text NOT NULL,
  "address" text,
  "memo" text,
  "status" text NOT NULL DEFAULT 'claiming',
  "claim_token" uuid DEFAULT gen_random_uuid(),
  "provider_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
-- Repair partially-created legacy tables before tightening the shape.  A
-- provider claim needs its own immutable identity even when an interrupted
-- first migration created only the business columns.
ALTER TABLE "whitebit_order_addresses"
  ADD COLUMN IF NOT EXISTS "id" uuid;
UPDATE "whitebit_order_addresses"
SET "id" = gen_random_uuid()
WHERE "id" IS NULL;
ALTER TABLE "whitebit_order_addresses"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "id" SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'whitebit_order_addresses'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "whitebit_order_addresses"
      ADD CONSTRAINT "whitebit_order_addresses_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
ALTER TABLE "whitebit_order_addresses"
  ADD COLUMN IF NOT EXISTS "order_id" text;
ALTER TABLE "whitebit_order_addresses"
  ADD COLUMN IF NOT EXISTS "ticker" text,
  ADD COLUMN IF NOT EXISTS "provider_ticker" text,
  ADD COLUMN IF NOT EXISTS "network" text,
  ADD COLUMN IF NOT EXISTS "address" text,
  ADD COLUMN IF NOT EXISTS "memo" text,
  ADD COLUMN IF NOT EXISTS "status" text,
  ADD COLUMN IF NOT EXISTS "claim_token" uuid,
  ADD COLUMN IF NOT EXISTS "provider_error" text,
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
UPDATE "whitebit_order_addresses"
SET "status" = COALESCE("status", 'claiming'),
    "claim_token" = COALESCE("claim_token", gen_random_uuid()),
    "created_at" = COALESCE("created_at", now()),
    "updated_at" = COALESCE("updated_at", now())
WHERE "status" IS NULL OR "claim_token" IS NULL OR "created_at" IS NULL OR "updated_at" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "whitebit_order_addresses" WHERE "order_id" IS NULL OR "ticker" IS NULL OR "provider_ticker" IS NULL OR "network" IS NULL) THEN
    RAISE EXCEPTION 'whitebit_order_addresses contains incomplete legacy rows; resolve them before applying 0073';
  END IF;
END $$;
ALTER TABLE "whitebit_order_addresses"
  ALTER COLUMN "order_id" SET NOT NULL,
  ALTER COLUMN "ticker" SET NOT NULL,
  ALTER COLUMN "provider_ticker" SET NOT NULL,
  ALTER COLUMN "network" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'claiming',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "claim_token" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_order_addresses_order_fk'
    AND conrelid = 'whitebit_order_addresses'::regclass) THEN
    ALTER TABLE "whitebit_order_addresses"
      ADD CONSTRAINT "whitebit_order_addresses_order_fk"
      FOREIGN KEY ("order_id") REFERENCES "exchange_orders"("id") ON DELETE RESTRICT;
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "whitebit_order_addresses" DROP CONSTRAINT IF EXISTS "whitebit_order_addresses_status_check";
  ALTER TABLE "whitebit_order_addresses"
    ADD CONSTRAINT "whitebit_order_addresses_status_check"
    CHECK ("status" IN ('claiming', 'calling', 'ready', 'failed', 'unresolved'));
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_order_address_order_uidx"
  ON "whitebit_order_addresses" ("order_id");
CREATE INDEX IF NOT EXISTS "whitebit_order_address_lookup_idx"
  ON "whitebit_order_addresses" ("address", "memo", "ticker", "network");

ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "funding_status" text NOT NULL DEFAULT 'ready_manual';
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "funding_provider_source" text NOT NULL DEFAULT 'manual';
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "funding_provider_error" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exchange_orders_funding_status_check'
    AND conrelid = 'exchange_orders'::regclass) THEN
    ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_funding_status_check"
      CHECK ("funding_status" IN ('provisioning', 'ready_whitebit', 'ready_manual', 'unresolved'));
  END IF;
END $$;

ALTER TABLE "whitebit_deposits" ADD COLUMN IF NOT EXISTS "order_address_id" uuid;
ALTER TABLE "whitebit_deposits" ADD COLUMN IF NOT EXISTS "order_id" text;
-- A partially-applied rollout may have orphaned provider references.  Keep
-- the immutable deposit audit row, but quarantine dangling ownership rather
-- than failing the whole upgrade while adding the relational constraints.
UPDATE "whitebit_deposits" AS deposits
SET "order_address_id" = NULL
WHERE "order_address_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "whitebit_order_addresses" AS claims
    WHERE claims."id" = deposits."order_address_id"
  );
UPDATE "whitebit_deposits" AS deposits
SET "order_id" = NULL
WHERE "order_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "exchange_orders" AS orders
    WHERE orders."id" = deposits."order_id"
  );
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_deposits_order_address_fk'
    AND conrelid = 'whitebit_deposits'::regclass) THEN
    ALTER TABLE "whitebit_deposits" ADD CONSTRAINT "whitebit_deposits_order_address_fk"
      FOREIGN KEY ("order_address_id") REFERENCES "whitebit_order_addresses"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_deposits_order_fk'
    AND conrelid = 'whitebit_deposits'::regclass) THEN
    ALTER TABLE "whitebit_deposits" ADD CONSTRAINT "whitebit_deposits_order_fk"
      FOREIGN KEY ("order_id") REFERENCES "exchange_orders"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "whitebit_deposit_order_tuple_idx"
  ON "whitebit_deposits" ("address", "memo", "ticker", "network", "order_id");

CREATE TABLE IF NOT EXISTS "whitebit_provider_settings" (
  "provider" text PRIMARY KEY,
  "disabled" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "updated_by_operator_id" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "whitebit_provider_settings" ADD COLUMN IF NOT EXISTS "disabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "whitebit_provider_settings" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
ALTER TABLE "whitebit_provider_settings" ADD COLUMN IF NOT EXISTS "updated_by_operator_id" text;
ALTER TABLE "whitebit_provider_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
UPDATE "whitebit_provider_settings"
SET "disabled" = COALESCE("disabled", true),
    "version" = COALESCE("version", 1),
    "updated_at" = COALESCE("updated_at", now())
WHERE "disabled" IS NULL OR "version" IS NULL OR "updated_at" IS NULL;
ALTER TABLE "whitebit_provider_settings" ALTER COLUMN "disabled" SET DEFAULT true;
ALTER TABLE "whitebit_provider_settings" ALTER COLUMN "disabled" SET NOT NULL;
ALTER TABLE "whitebit_provider_settings" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "whitebit_provider_settings" ALTER COLUMN "version" SET NOT NULL;
ALTER TABLE "whitebit_provider_settings" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "whitebit_provider_settings" ALTER COLUMN "updated_at" SET NOT NULL;
INSERT INTO "whitebit_provider_settings" ("provider", "disabled", "version")
VALUES ('whitebit', true, 1)
ON CONFLICT ("provider") DO NOTHING;

CREATE TABLE IF NOT EXISTS "whitebit_order_history_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_address_id" uuid NOT NULL REFERENCES "whitebit_order_addresses"("id") ON DELETE CASCADE,
  "high_water_identity" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "whitebit_order_history_checkpoints"
  ADD COLUMN IF NOT EXISTS "id" uuid;
UPDATE "whitebit_order_history_checkpoints"
SET "id" = gen_random_uuid()
WHERE "id" IS NULL;
ALTER TABLE "whitebit_order_history_checkpoints"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "id" SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'whitebit_order_history_checkpoints'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "whitebit_order_history_checkpoints"
      ADD CONSTRAINT "whitebit_order_history_checkpoints_pkey" PRIMARY KEY ("id");
  END IF;
END $$;
ALTER TABLE "whitebit_order_history_checkpoints"
  ADD COLUMN IF NOT EXISTS "order_address_id" uuid,
  ADD COLUMN IF NOT EXISTS "high_water_identity" text,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;
UPDATE "whitebit_order_history_checkpoints"
SET "updated_at" = COALESCE("updated_at", now())
WHERE "updated_at" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "whitebit_order_history_checkpoints" WHERE "order_address_id" IS NULL OR "updated_at" IS NULL) THEN
    RAISE EXCEPTION 'whitebit_order_history_checkpoints contains incomplete legacy rows; resolve them before applying 0073';
  END IF;
END $$;
ALTER TABLE "whitebit_order_history_checkpoints"
  ALTER COLUMN "order_address_id" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whitebit_order_history_checkpoint_order_fk'
    AND conrelid = 'whitebit_order_history_checkpoints'::regclass) THEN
    ALTER TABLE "whitebit_order_history_checkpoints"
      ADD CONSTRAINT "whitebit_order_history_checkpoint_order_fk"
      FOREIGN KEY ("order_address_id") REFERENCES "whitebit_order_addresses"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_order_history_checkpoint_address_uidx"
  ON "whitebit_order_history_checkpoints" ("order_address_id");

-- Runtime can never delete provider audit records or address claims.
GRANT SELECT, INSERT, UPDATE ON "whitebit_order_addresses", "whitebit_provider_settings",
  "whitebit_order_history_checkpoints" TO quickex_app_runtime;
REVOKE DELETE ON "whitebit_order_addresses", "whitebit_provider_settings",
  "whitebit_order_history_checkpoints" FROM quickex_app_runtime;