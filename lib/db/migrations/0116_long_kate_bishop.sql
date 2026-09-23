CREATE TABLE "site_partner_logo_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_partner_logo_settings_object_check" CHECK (jsonb_typeof("site_partner_logo_settings"."settings") = 'object')
);
--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD COLUMN "light_object_path" text;--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD COLUMN "dark_object_path" text;--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD COLUMN "appearance" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD COLUMN "sort_order" integer;--> statement-breakpoint
ALTER TABLE "site_publication_revisions" ADD COLUMN "partner_logo_settings" jsonb;--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD CONSTRAINT "site_partner_logos_light_path_check" CHECK ("site_partner_logos"."light_object_path" is null or "site_partner_logos"."light_object_path" ~ '^/objects/partner-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD CONSTRAINT "site_partner_logos_dark_path_check" CHECK ("site_partner_logos"."dark_object_path" is null or "site_partner_logos"."dark_object_path" ~ '^/objects/partner-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');--> statement-breakpoint
ALTER TABLE "site_partner_logos" ADD CONSTRAINT "site_partner_logos_appearance_check" CHECK ("site_partner_logos"."appearance" in ('auto','same','separate'));--> statement-breakpoint
ALTER TABLE "site_publication_revisions" ADD CONSTRAINT "site_publication_partner_logo_settings_object_check" CHECK ("site_publication_revisions"."partner_logo_settings" is null or jsonb_typeof("site_publication_revisions"."partner_logo_settings") = 'object');--> statement-breakpoint