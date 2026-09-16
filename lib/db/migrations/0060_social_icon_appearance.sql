ALTER TABLE "site_social_trust_settings"
  ADD COLUMN IF NOT EXISTS "appearance" jsonb NOT NULL DEFAULT '{"iconSize":16,"logoSize":72,"circleSize":36,"borderThickness":1,"radiusMode":"circle","backgroundColor":"#111827","borderColor":"#374151","glowColor":"#6366f1","glowIntensity":0,"iconOpacity":100}'::jsonb;

ALTER TABLE "site_social_trust_settings"
  DROP CONSTRAINT IF EXISTS "site_social_trust_settings_appearance_object_check";

ALTER TABLE "site_social_trust_settings"
  ADD CONSTRAINT "site_social_trust_settings_appearance_object_check"
  CHECK (jsonb_typeof("appearance") = 'object');