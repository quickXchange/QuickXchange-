ALTER TABLE "site_social_trust_settings"
  ADD COLUMN IF NOT EXISTS "instagram_url" text,
  ADD COLUMN IF NOT EXISTS "x_url" text,
  ADD COLUMN IF NOT EXISTS "facebook_url" text,
  ADD COLUMN IF NOT EXISTS "telegram_url" text;