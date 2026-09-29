ALTER TABLE "manual_swap_addons" ADD COLUMN "fee_type" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_swap_addons" ADD COLUMN "percentage" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "manual_swap_addons" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;