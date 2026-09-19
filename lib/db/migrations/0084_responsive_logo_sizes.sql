ALTER TABLE "website_branding_settings"
  ADD COLUMN IF NOT EXISTS "desktop_logo_width" integer DEFAULT 138 NOT NULL,
  ADD COLUMN IF NOT EXISTS "desktop_logo_max_height" integer DEFAULT 30 NOT NULL,
  ADD COLUMN IF NOT EXISTS "tablet_logo_width" integer DEFAULT 130 NOT NULL,
  ADD COLUMN IF NOT EXISTS "tablet_logo_max_height" integer DEFAULT 28 NOT NULL,
  ADD COLUMN IF NOT EXISTS "mobile_logo_width" integer DEFAULT 116 NOT NULL,
  ADD COLUMN IF NOT EXISTS "mobile_logo_max_height" integer DEFAULT 28 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_branding_desktop_logo_width_check'
      AND conrelid = 'website_branding_settings'::regclass
  ) THEN
    ALTER TABLE "website_branding_settings"
      ADD CONSTRAINT "website_branding_desktop_logo_width_check"
      CHECK ("desktop_logo_width" between 40 and 320);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_branding_desktop_logo_max_height_check'
      AND conrelid = 'website_branding_settings'::regclass
  ) THEN
    ALTER TABLE "website_branding_settings"
      ADD CONSTRAINT "website_branding_desktop_logo_max_height_check"
      CHECK ("desktop_logo_max_height" between 16 and 44);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_branding_tablet_logo_width_check'
      AND conrelid = 'website_branding_settings'::regclass
  ) THEN
    ALTER TABLE "website_branding_settings"
      ADD CONSTRAINT "website_branding_tablet_logo_width_check"
      CHECK ("tablet_logo_width" between 40 and 280);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_branding_tablet_logo_max_height_check'
      AND conrelid = 'website_branding_settings'::regclass
  ) THEN
    ALTER TABLE "website_branding_settings"
      ADD CONSTRAINT "website_branding_tablet_logo_max_height_check"
      CHECK ("tablet_logo_max_height" between 16 and 44);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_branding_mobile_logo_width_check'
      AND conrelid = 'website_branding_settings'::regclass
  ) THEN
    ALTER TABLE "website_branding_settings"
      ADD CONSTRAINT "website_branding_mobile_logo_width_check"
      CHECK ("mobile_logo_width" between 32 and 220);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_branding_mobile_logo_max_height_check'
      AND conrelid = 'website_branding_settings'::regclass
  ) THEN
    ALTER TABLE "website_branding_settings"
      ADD CONSTRAINT "website_branding_mobile_logo_max_height_check"
      CHECK ("mobile_logo_max_height" between 16 and 44);
  END IF;
END
$$;