ALTER TABLE "deposit_provider_switch_jobs" ADD COLUMN "monitoring" jsonb;--> statement-breakpoint
ALTER TABLE "deposit_provider_switch_routes" ADD COLUMN "monitoring_message" text;