CREATE TABLE IF NOT EXISTS "swap_default_pair_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "source_settlement_option_id" text NOT NULL,
  "target_settlement_option_id" text NOT NULL,
  CONSTRAINT "swap_default_pair_settings_id_check" CHECK ("id" = 'global')
);