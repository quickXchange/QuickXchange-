CREATE TABLE IF NOT EXISTS "customer_status_notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"customer_clerk_user_id" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "status_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint constraint_record
		JOIN pg_namespace namespace
			ON namespace.oid = constraint_record.connamespace
		WHERE constraint_record.conname = 'customer_status_notification_events_order_id_exchange_orders_id_fk'
			AND namespace.nspname = current_schema()
	) THEN
		ALTER TABLE "customer_status_notification_events"
			ADD CONSTRAINT "customer_status_notification_events_order_id_exchange_orders_id_fk"
			FOREIGN KEY ("order_id") REFERENCES "exchange_orders"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_status_notification_transition_uidx" ON "customer_status_notification_events" USING btree ("order_id","from_status","to_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_status_notification_delivery_idx" ON "customer_status_notification_events" USING btree ("delivery_status","next_attempt_at","created_at");