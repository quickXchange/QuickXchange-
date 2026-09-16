CREATE TABLE IF NOT EXISTS "customer_profiles" (
  "customer_id" text PRIMARY KEY REFERENCES "exchange_customers"("id") ON DELETE CASCADE,
  "clerk_user_id" text UNIQUE,
  "first_name" text NOT NULL DEFAULT '',
  "last_name" text NOT NULL DEFAULT '',
  "country" text NOT NULL DEFAULT '',
  "role" text NOT NULL DEFAULT 'customer',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "affiliate_accounts" ADD COLUMN IF NOT EXISTS "custom_referral_rate" numeric(36, 18);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_management_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_operator_id" text NOT NULL,
  "target_customer_id" text NOT NULL REFERENCES "exchange_customers"("id"),
  "action" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_clerk_user_idx" ON "customer_profiles" ("clerk_user_id");
CREATE INDEX IF NOT EXISTS "customer_management_audit_target_idx" ON "customer_management_audit_logs" ("target_customer_id", "created_at");