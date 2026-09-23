ALTER TABLE site_social_trust_links
  ADD COLUMN IF NOT EXISTS light_object_path text,
  ADD COLUMN IF NOT EXISTS dark_object_path text,
  ADD COLUMN IF NOT EXISTS appearance text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'icon-only',
  ADD COLUMN IF NOT EXISTS sort_order integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_social_trust_links_light_path_check' AND conrelid = 'site_social_trust_links'::regclass) THEN
    ALTER TABLE site_social_trust_links ADD CONSTRAINT site_social_trust_links_light_path_check
      CHECK (light_object_path IS NULL OR light_object_path ~ '^/objects/social-trust-icons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_social_trust_links_dark_path_check' AND conrelid = 'site_social_trust_links'::regclass) THEN
    ALTER TABLE site_social_trust_links ADD CONSTRAINT site_social_trust_links_dark_path_check
      CHECK (dark_object_path IS NULL OR dark_object_path ~ '^/objects/social-trust-icons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_social_trust_links_appearance_check' AND conrelid = 'site_social_trust_links'::regclass) THEN
    ALTER TABLE site_social_trust_links ADD CONSTRAINT site_social_trust_links_appearance_check
      CHECK (appearance IN ('auto','same','separate'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_social_trust_links_display_mode_check' AND conrelid = 'site_social_trust_links'::regclass) THEN
    ALTER TABLE site_social_trust_links ADD CONSTRAINT site_social_trust_links_display_mode_check
      CHECK (display_mode IN ('icon-only','icon-name'));
  END IF;
END $$;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY group_name ORDER BY created_at, id) - 1 AS item_order
  FROM site_social_trust_links
)
UPDATE site_social_trust_links AS links
SET sort_order = numbered.item_order
FROM numbered
WHERE links.id = numbered.id AND links.sort_order IS NULL;