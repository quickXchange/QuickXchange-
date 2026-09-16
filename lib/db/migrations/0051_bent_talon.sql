CREATE TABLE "site_social_trust_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_name" text DEFAULT 'social' NOT NULL,
	"name" text NOT NULL,
	"href" text NOT NULL,
	"object_path" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_social_trust_links_group_check" CHECK ("site_social_trust_links"."group_name" in ('social','trust')),
	CONSTRAINT "site_social_trust_links_path_check" CHECK ("site_social_trust_links"."object_path" ~ '^/objects/social-trust-icons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
--> statement-breakpoint
CREATE TABLE "site_social_trust_settings" (
	"id" text PRIMARY KEY DEFAULT 'footer' NOT NULL,
	"social_title" text DEFAULT 'Stay connected with us' NOT NULL,
	"trust_title" text DEFAULT 'Share your feedback with us' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_publication_revisions" ADD COLUMN "social_trust" jsonb DEFAULT '{"socialTitle":"Stay connected with us","trustTitle":"Share your feedback with us","items":[]}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "site_social_trust_links_group_order_idx" ON "site_social_trust_links" USING btree ("group_name","sort_order");--> statement-breakpoint
ALTER TABLE "site_publication_revisions" ADD CONSTRAINT "site_publication_social_trust_object_check" CHECK (jsonb_typeof("site_publication_revisions"."social_trust") = 'object');