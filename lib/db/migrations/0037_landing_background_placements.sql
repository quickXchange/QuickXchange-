ALTER TABLE "landing_background_settings"
  ADD COLUMN "placements" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "landing_background_settings"
  ADD CONSTRAINT "landing_background_settings_placements_object_check"
  CHECK (jsonb_typeof("placements") = 'object');