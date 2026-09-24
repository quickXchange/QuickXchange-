ALTER TABLE whitebit_provider_settings
  ADD COLUMN IF NOT EXISTS credential_verified_fingerprint text,
  ADD COLUMN IF NOT EXISTS credential_verified_at timestamptz;