ALTER TABLE "whitebit_provider_settings"
  ADD COLUMN IF NOT EXISTS "deposit_route_proofs" jsonb DEFAULT '[]'::jsonb NOT NULL;