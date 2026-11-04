CREATE TABLE "order_profit_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_profit_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_key" text NOT NULL,
	"kind" text NOT NULL,
	"basis" jsonb,
	"execution" jsonb,
	"amount" text,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "order_profit_records_order_idx" ON "order_profit_records" USING btree ("order_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_profit_records_request_idx" ON "order_profit_records" USING btree ("request_id");
--> statement-breakpoint
ALTER TABLE order_profit_records ADD CONSTRAINT order_profit_records_kind_check CHECK (
  (kind = 'basis' AND basis IS NOT NULL AND execution IS NOT NULL AND amount IS NULL) OR
  (kind = 'adjustment' AND basis IS NULL AND execution IS NULL AND amount IS NOT NULL)
);
--> statement-breakpoint
CREATE FUNCTION prevent_order_profit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Order accounting history is append-only; record a correction or adjustment.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_profit_records_immutable BEFORE UPDATE OR DELETE ON order_profit_records
FOR EACH ROW EXECUTE FUNCTION prevent_order_profit_mutation();
--> statement-breakpoint
CREATE TRIGGER order_profit_rates_immutable BEFORE UPDATE OR DELETE ON order_profit_rates
FOR EACH ROW EXECUTE FUNCTION prevent_order_profit_mutation();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON order_profit_records, order_profit_rates FROM quickex_app_runtime;