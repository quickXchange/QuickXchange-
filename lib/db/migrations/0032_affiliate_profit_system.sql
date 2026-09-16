CREATE TABLE "affiliate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_clerk_user_id" text NOT NULL,
	"code" text NOT NULL,
	"referrer_account_id" uuid,
	"referrer_bound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_account_id" uuid NOT NULL,
	"referred_customer_account_id" uuid,
	"completion_event_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"kind" text DEFAULT 'commission' NOT NULL,
	"amount_usd" numeric(36, 18) NOT NULL,
	"volume_usd" numeric(36, 18) NOT NULL,
	"rate" numeric(36, 18) NOT NULL,
	"settings_version" integer NOT NULL,
	"valuation" jsonb NOT NULL,
	"reversal_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_completion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"completion_version" integer NOT NULL,
	"event_type" text DEFAULT 'completed' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_account_id" uuid NOT NULL,
	"amount_usd" numeric(36, 18) NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"destination" jsonb NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"paid_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_program_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"quickex_enabled" boolean DEFAULT false NOT NULL,
	"manual_enabled" boolean DEFAULT false NOT NULL,
	"commission_rate" numeric(36, 18) DEFAULT '0' NOT NULL,
	"minimum_eligible_usd" numeric(36, 18) DEFAULT '0' NOT NULL,
	"payout_minimum_usd" numeric(36, 18) DEFAULT '0' NOT NULL,
	"transaction_cap_usd" numeric(36, 18),
	"cookie_duration_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "affiliate_program_settings_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "affiliate_valuation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"completion_event_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliate_account_id_affiliate_accounts_id_fk" FOREIGN KEY ("affiliate_account_id") REFERENCES "public"."affiliate_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_referred_customer_account_id_affiliate_accounts_id_fk" FOREIGN KEY ("referred_customer_account_id") REFERENCES "public"."affiliate_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_completion_event_id_affiliate_completion_events_id_fk" FOREIGN KEY ("completion_event_id") REFERENCES "public"."affiliate_completion_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payout_requests" ADD CONSTRAINT "affiliate_payout_requests_affiliate_account_id_affiliate_accounts_id_fk" FOREIGN KEY ("affiliate_account_id") REFERENCES "public"."affiliate_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_valuation_reviews" ADD CONSTRAINT "affiliate_valuation_reviews_completion_event_id_affiliate_completion_events_id_fk" FOREIGN KEY ("completion_event_id") REFERENCES "public"."affiliate_completion_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_accounts_customer_uidx" ON "affiliate_accounts" USING btree ("customer_clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_accounts_code_uidx" ON "affiliate_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "affiliate_accounts_referrer_idx" ON "affiliate_accounts" USING btree ("referrer_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commission_event_uidx" ON "affiliate_commissions" USING btree ("completion_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commission_reversal_uidx" ON "affiliate_commissions" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "affiliate_commissions_account_created_idx" ON "affiliate_commissions" USING btree ("affiliate_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_completion_event_uidx" ON "affiliate_completion_events" USING btree ("aggregate_type","aggregate_id","completion_version","event_type");--> statement-breakpoint
CREATE INDEX "affiliate_payout_requests_status_idx" ON "affiliate_payout_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_valuation_review_event_uidx" ON "affiliate_valuation_reviews" USING btree ("completion_event_id");
--> statement-breakpoint
ALTER TABLE "affiliate_accounts" ADD CONSTRAINT "affiliate_accounts_referrer_fk" FOREIGN KEY ("referrer_account_id") REFERENCES "public"."affiliate_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "affiliate_accounts" ADD CONSTRAINT "affiliate_accounts_not_self_referrer" CHECK ("referrer_account_id" IS NULL OR "referrer_account_id" <> "id");
--> statement-breakpoint
ALTER TABLE "affiliate_program_settings" ADD CONSTRAINT "affiliate_settings_valid_values" CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1 AND "minimum_eligible_usd" >= 0 AND "payout_minimum_usd" >= 0 AND ("transaction_cap_usd" IS NULL OR "transaction_cap_usd" > 0) AND "cookie_duration_days" BETWEEN 1 AND 365);
--> statement-breakpoint
ALTER TABLE "affiliate_payout_requests" ADD CONSTRAINT "affiliate_payout_requests_valid" CHECK ("amount_usd" > 0 AND "status" IN ('requested','approved','rejected','processing','paid'));
--> statement-breakpoint
ALTER TABLE "affiliate_completion_events" ADD CONSTRAINT "affiliate_completion_events_valid" CHECK ("aggregate_type" IN ('manual','quickex') AND "event_type" IN ('completed','reversal') AND "status" IN ('pending','processed','ignored','review_required'));
--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_commission_aggregate_once_uidx" ON "affiliate_commissions" USING btree ("aggregate_type","aggregate_id") WHERE "kind" = 'commission';
--> statement-breakpoint
CREATE INDEX "affiliate_completion_events_pending_idx" ON "affiliate_completion_events" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "affiliate_commissions_referred_customer_idx" ON "affiliate_commissions" USING btree ("referred_customer_account_id","kind");