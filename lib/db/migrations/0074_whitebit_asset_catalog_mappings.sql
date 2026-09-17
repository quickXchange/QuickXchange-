CREATE TABLE IF NOT EXISTS "whitebit_asset_mappings" (
  "id" text PRIMARY KEY NOT NULL,
  "asset_id" text NOT NULL REFERENCES "crypto_assets"("id") ON DELETE CASCADE,
  "provider_ticker" text NOT NULL,
  "normalized_ticker" text NOT NULL,
  "provider_name" text NOT NULL,
  "precision" integer NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_asset_mappings_asset_uidx" ON "whitebit_asset_mappings" ("asset_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_asset_mappings_ticker_uidx" ON "whitebit_asset_mappings" ("normalized_ticker");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whitebit_network_mappings" (
  "id" text PRIMARY KEY NOT NULL,
  "asset_network_id" text NOT NULL REFERENCES "crypto_asset_networks"("id") ON DELETE CASCADE,
  "provider_network" text NOT NULL,
  "normalized_network" text NOT NULL,
  "can_deposit" boolean NOT NULL DEFAULT false,
  "can_withdraw" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_network_mappings_route_uidx" ON "whitebit_network_mappings" ("asset_network_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quickex_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      whitebit_asset_mappings,
      whitebit_network_mappings
    TO quickex_app_runtime;
  END IF;
END
$$;