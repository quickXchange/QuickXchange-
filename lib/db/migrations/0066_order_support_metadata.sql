CREATE TABLE IF NOT EXISTS "order_support_metadata" (
  "order_id" text PRIMARY KEY,
  "provider_kind" text NOT NULL,
  "support_status" text NOT NULL DEFAULT 'open',
  "sending_status" text NOT NULL DEFAULT 'pending',
  "receiving_status" text NOT NULL DEFAULT 'pending',
  "sent_amount_override" numeric,
  "receive_amount_override" numeric,
  "exchange_rate_override" numeric,
  "network_fee_amount" numeric,
  "transaction_hash" text,
  "payment_reference" text,
  "assigned_operator_id" uuid,
  "note" text NOT NULL DEFAULT '',
  "record_version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE "order_support_metadata" ADD CONSTRAINT "order_support_metadata_support_status_check"
    CHECK ("support_status" IN ('open','in_progress','done','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_support_metadata" ADD CONSTRAINT "order_support_metadata_amounts_check"
    CHECK (("sent_amount_override" IS NULL OR "sent_amount_override" > 0) AND ("receive_amount_override" IS NULL OR "receive_amount_override" > 0) AND ("exchange_rate_override" IS NULL OR "exchange_rate_override" > 0) AND ("network_fee_amount" IS NULL OR "network_fee_amount" >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_support_metadata" ADD CONSTRAINT "order_support_metadata_text_lengths_check"
    CHECK (length("transaction_hash") <= 500 AND length("payment_reference") <= 500 AND length("note") <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_support_metadata" ADD CONSTRAINT "order_support_metadata_sending_status_check"
    CHECK ("sending_status" IN ('pending','sent','failed','confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_support_metadata" ADD CONSTRAINT "order_support_metadata_receiving_status_check"
    CHECK ("receiving_status" IN ('pending','sent','failed','confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;