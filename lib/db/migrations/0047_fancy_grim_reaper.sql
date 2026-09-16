CREATE TABLE "site_contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"ip_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_nav_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"href" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"header" boolean DEFAULT false NOT NULL,
	"footer" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_partner_logos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"object_path" text NOT NULL,
	"link" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_partner_logos_path_check" CHECK ("site_partner_logos"."object_path" ~ '^/objects/partner-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
--> statement-breakpoint
CREATE TABLE "site_content_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"page_key" text,
	"revision_id" uuid,
	"target_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_key" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_content_page_key_check" CHECK ("site_content_revisions"."page_key" in ('home','convert','swap','market-rates','about-us','affiliate-program','operations','contact-us')),
	CONSTRAINT "site_content_status_check" CHECK ("site_content_revisions"."status" in ('draft','published')),
	CONSTRAINT "site_content_content_object_check" CHECK (jsonb_typeof("site_content_revisions"."content") = 'object')
);
--> statement-breakpoint
ALTER TABLE "site_content_audit_logs" ADD CONSTRAINT "site_content_audit_logs_revision_id_site_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "site_content_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_contact_submissions_created_idx" ON "site_contact_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "site_contact_submissions_ip_created_idx" ON "site_contact_submissions" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "site_nav_links_placement_order_idx" ON "site_nav_links" USING btree ("header","footer","sort_order");--> statement-breakpoint
CREATE INDEX "site_partner_logos_enabled_order_idx" ON "site_partner_logos" USING btree ("enabled","sort_order");--> statement-breakpoint
CREATE INDEX "site_content_audit_page_idx" ON "site_content_audit_logs" USING btree ("page_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_content_page_revision_uidx" ON "site_content_revisions" USING btree ("page_key","revision");--> statement-breakpoint
CREATE INDEX "site_content_page_status_idx" ON "site_content_revisions" USING btree ("page_key","status","revision");