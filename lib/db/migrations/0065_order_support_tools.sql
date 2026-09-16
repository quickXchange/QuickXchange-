ALTER TABLE "exchange_orders"
  ADD COLUMN IF NOT EXISTS "support_status" text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "sending_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "receiving_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "sent_amount_override" numeric,
  ADD COLUMN IF NOT EXISTS "receive_amount_override" numeric,
  ADD COLUMN IF NOT EXISTS "exchange_rate_override" numeric,
  ADD COLUMN IF NOT EXISTS "network_fee_amount" numeric,
  ADD COLUMN IF NOT EXISTS "transaction_hash" text,
  ADD COLUMN IF NOT EXISTS "payment_reference" text;

DO $$ BEGIN
  ALTER TABLE "exchange_orders"
    ADD CONSTRAINT "exchange_orders_support_status_check"
    CHECK ("support_status" IN ('open', 'in_progress', 'done', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_support_amounts_check"
    CHECK (("sent_amount_override" IS NULL OR "sent_amount_override" > 0) AND ("receive_amount_override" IS NULL OR "receive_amount_override" > 0) AND ("exchange_rate_override" IS NULL OR "exchange_rate_override" > 0) AND ("network_fee_amount" IS NULL OR "network_fee_amount" >= 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_support_text_lengths_check"
    CHECK (length("transaction_hash") <= 500 AND length("payment_reference") <= 500 AND length("note") <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "exchange_orders"
    ADD CONSTRAINT "exchange_orders_sending_status_check"
    CHECK ("sending_status" IN ('pending', 'sent', 'failed', 'confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "exchange_orders"
    ADD CONSTRAINT "exchange_orders_receiving_status_check"
    CHECK ("receiving_status" IN ('pending', 'sent', 'failed', 'confirmed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;