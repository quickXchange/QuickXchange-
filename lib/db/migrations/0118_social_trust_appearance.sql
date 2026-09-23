ALTER TABLE site_social_trust_settings
  ADD COLUMN IF NOT EXISTS trust_appearance jsonb;