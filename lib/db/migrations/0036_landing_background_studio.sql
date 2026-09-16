CREATE TABLE IF NOT EXISTS "landing_background_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" integer NOT NULL,
  "mode" text DEFAULT 'preset' NOT NULL,
  "preset_id" text DEFAULT 'neon-orbit',
  "custom_object_path" text,
  "focal_x" integer DEFAULT 50 NOT NULL,
  "focal_y" integer DEFAULT 50 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text NOT NULL,
  CONSTRAINT "landing_background_settings_version_check" CHECK ("version" > 0),
  CONSTRAINT "landing_background_settings_focal_x_check" CHECK ("focal_x" BETWEEN 0 AND 100),
  CONSTRAINT "landing_background_settings_focal_y_check" CHECK ("focal_y" BETWEEN 0 AND 100),
  CONSTRAINT "landing_background_settings_selection_check" CHECK (
    ("mode" = 'preset' AND "preset_id" IN ('neon-orbit','crystal-ledger','quantum-grid','liquid-token','aurora-chain','prism-vault','network-bloom','electric-canyon','cosmic-exchange','blueprint-future') AND "custom_object_path" IS NULL)
    OR
    ("mode" = 'custom' AND "preset_id" IS NULL AND "custom_object_path" ~ '^/objects/landing-backgrounds/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "landing_background_settings_version_uidx" ON "landing_background_settings" ("version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_background_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text DEFAULT 'landing_background.published' NOT NULL,
  "actor_id" text NOT NULL,
  "setting_id" uuid NOT NULL REFERENCES "landing_background_settings"("id"),
  "version" integer NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_background_audit_setting_idx" ON "landing_background_audit_logs" ("setting_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION landing_background_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'landing background records are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS landing_background_settings_append_only ON landing_background_settings;
--> statement-breakpoint
CREATE TRIGGER landing_background_settings_append_only BEFORE UPDATE OR DELETE ON landing_background_settings
FOR EACH ROW EXECUTE FUNCTION landing_background_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS landing_background_audit_append_only ON landing_background_audit_logs;
--> statement-breakpoint
CREATE TRIGGER landing_background_audit_append_only BEFORE UPDATE OR DELETE ON landing_background_audit_logs
FOR EACH ROW EXECUTE FUNCTION landing_background_reject_mutation();