ALTER TABLE "customer_status_notification_events"
	ADD COLUMN IF NOT EXISTS "provider_idempotency_started_at" timestamp with time zone;--> statement-breakpoint
UPDATE "customer_status_notification_events"
SET
	"delivery_status" = 'failed',
	"claim_token" = NULL,
	"claim_expires_at" = NULL,
	"last_error_code" = 'EMAIL_LEGACY_SEND_AMBIGUOUS'
WHERE "provider_idempotency_started_at" IS NULL
	AND (
		"delivery_status" = 'sending'
		OR (
			"delivery_status" = 'pending'
			AND "attempt_count" > 0
		)
	);