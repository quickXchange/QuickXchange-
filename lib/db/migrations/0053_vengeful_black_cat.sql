CREATE TABLE IF NOT EXISTS "website_branding_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"light_logo_path" text,
	"dark_logo_path" text,
	"mobile_logo_path" text,
	"favicon_path" text,
	"logo_width" integer DEFAULT 180 NOT NULL,
	"logo_height" integer DEFAULT 44 NOT NULL,
	"logo_max_width" integer DEFAULT 240 NOT NULL,
	"alignment" text DEFAULT 'left' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_branding_id_check" CHECK ("website_branding_settings"."id" = 'global'),
	CONSTRAINT "website_branding_logo_width_check" CHECK ("website_branding_settings"."logo_width" between 1 and 4096),
	CONSTRAINT "website_branding_logo_height_check" CHECK ("website_branding_settings"."logo_height" between 1 and 4096),
	CONSTRAINT "website_branding_logo_max_width_check" CHECK ("website_branding_settings"."logo_max_width" between 1 and 4096),
	CONSTRAINT "website_branding_alignment_check" CHECK ("website_branding_settings"."alignment" in ('left','center','right')),
	CONSTRAINT "website_branding_paths_check" CHECK (
    ("website_branding_settings"."light_logo_path" IS NULL OR "website_branding_settings"."light_logo_path" ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND ("website_branding_settings"."dark_logo_path" IS NULL OR "website_branding_settings"."dark_logo_path" ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND ("website_branding_settings"."mobile_logo_path" IS NULL OR "website_branding_settings"."mobile_logo_path" ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    AND ("website_branding_settings"."favicon_path" IS NULL OR "website_branding_settings"."favicon_path" ~ '^/objects/website-branding/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  )
);
