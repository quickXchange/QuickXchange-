ALTER TABLE "site_social_trust_links"
  ALTER COLUMN "object_path" DROP NOT NULL;

ALTER TABLE "site_social_trust_links"
  DROP CONSTRAINT IF EXISTS "site_social_trust_links_path_check";

ALTER TABLE "site_social_trust_links"
  ADD CONSTRAINT "site_social_trust_links_path_check"
  CHECK ("object_path" IS NULL OR "object_path" ~ '^/objects/social-trust-icons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Convert the four historical fixed URL fields into ordinary editable items.
-- The fields are then cleared so the ordered item collection becomes the
-- single source of truth after this migration.
WITH legacy_platforms AS (
  SELECT
    settings.updated_by,
    platform.name,
    platform.href,
    platform.position
  FROM "site_social_trust_settings" settings
  CROSS JOIN LATERAL (
    VALUES
      ('Telegram', settings.telegram_url, 0),
      ('X', settings.x_url, 1),
      ('Instagram', settings.instagram_url, 2),
      ('Facebook', settings.facebook_url, 3)
  ) AS platform(name, href, position)
  WHERE settings.id = 'footer' AND platform.href IS NOT NULL
),
next_order AS (
  SELECT COALESCE(MAX(sort_order) + 1, 0) AS value
  FROM "site_social_trust_links"
  WHERE removed_at IS NULL
)
INSERT INTO "site_social_trust_links"
  (id, group_name, name, href, object_path, enabled, sort_order, created_by)
SELECT
  gen_random_uuid(),
  'social',
  legacy.name,
  legacy.href,
  NULL,
  TRUE,
  next_order.value + legacy.position,
  legacy.updated_by
FROM legacy_platforms legacy
CROSS JOIN next_order
WHERE NOT EXISTS (
  SELECT 1
  FROM "site_social_trust_links" existing
  WHERE existing.removed_at IS NULL
    AND (
      lower(existing.name) = lower(legacy.name)
      OR existing.href = legacy.href
    )
);

UPDATE "site_social_trust_settings"
SET
  instagram_url = NULL,
  x_url = NULL,
  facebook_url = NULL,
  telegram_url = NULL,
  updated_at = now()
WHERE id = 'footer'
  AND (
    instagram_url IS NOT NULL
    OR x_url IS NOT NULL
    OR facebook_url IS NOT NULL
    OR telegram_url IS NOT NULL
  );