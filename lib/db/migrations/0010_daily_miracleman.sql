DROP INDEX IF EXISTS "customer_status_notification_transition_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_status_notification_delivery_idx";--> statement-breakpoint
ALTER TABLE "customer_status_notification_events" ADD COLUMN IF NOT EXISTS "status_version" integer;--> statement-breakpoint
ALTER TABLE "customer_status_notification_events" ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "status_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH ranked_events AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "order_id"
			ORDER BY "created_at", "id"
		)::integer AS "inferred_status_version"
	FROM "customer_status_notification_events"
)
UPDATE "customer_status_notification_events" event
SET "status_version" = ranked_events."inferred_status_version"
FROM ranked_events
WHERE event."id" = ranked_events."id"
	AND event."status_version" IS NULL;--> statement-breakpoint
UPDATE "exchange_orders" order_record
SET "status_version" = greatest(
	order_record."status_version",
	coalesce((
		SELECT max(event."status_version")
		FROM "customer_status_notification_events" event
		WHERE event."order_id" = order_record."id"
	), 0)
);--> statement-breakpoint
ALTER TABLE "customer_status_notification_events" ALTER COLUMN "status_version" SET NOT NULL;--> statement-breakpoint
DO $$
DECLARE
	expected_orders_table oid := to_regclass(format('%I.exchange_orders', current_schema()));
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_constraint constraint_record
		JOIN pg_namespace namespace
			ON namespace.oid = constraint_record.connamespace
		WHERE constraint_record.conname = 'customer_status_notification_events_order_id_exchange_orders_id_fk'
			AND namespace.nspname = current_schema()
			AND constraint_record.confrelid <> expected_orders_table
	) THEN
		ALTER TABLE "customer_status_notification_events"
			DROP CONSTRAINT "customer_status_notification_events_order_id_exchange_orders_id_fk";
	END IF;
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
CREATE UNIQUE INDEX IF NOT EXISTS "customer_status_notification_version_uidx" ON "customer_status_notification_events" USING btree ("order_id","status_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_status_notification_delivery_idx" ON "customer_status_notification_events" USING btree ("delivery_status","next_attempt_at","claim_expires_at","created_at");