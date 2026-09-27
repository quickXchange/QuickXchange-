CREATE TABLE IF NOT EXISTS "convert_default_pair_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "from_asset" text NOT NULL,
  "from_network" text NOT NULL,
  "to_asset" text NOT NULL,
  "to_network" text NOT NULL,
  CONSTRAINT "convert_default_pair_settings_id_check" CHECK ("id" = 'global')
);