ALTER TABLE "provider_integrations" ADD COLUMN "verification_version" integer;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "verified_credential_fingerprint" text;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD COLUMN "verified_at" timestamp with time zone;