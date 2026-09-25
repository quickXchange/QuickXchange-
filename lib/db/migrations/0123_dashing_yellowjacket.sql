CREATE TABLE IF NOT EXISTS "whitebit_history_worker_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"cursor_order_id" text,
	"credential_source" text,
	"last_poll_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"last_error_code" text,
	"next_attempt_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
