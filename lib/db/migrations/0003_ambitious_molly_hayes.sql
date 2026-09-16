CREATE TABLE IF NOT EXISTS "desk_operator_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"actor_clerk_user_id" text,
	"target_operator_id" uuid,
	"target_email" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "desk_operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"clerk_user_id" text,
	"role" text DEFAULT 'operator' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"auth_version" integer DEFAULT 1 NOT NULL,
	"invited_by" text,
	"approved_by" text,
	"suspended_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desk_operators_email_unique" UNIQUE("email"),
	CONSTRAINT "desk_operators_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
