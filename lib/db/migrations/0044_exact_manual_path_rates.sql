ALTER TABLE "manual_desk_pricing_rules"
  ADD COLUMN IF NOT EXISTS "exact_rate" numeric(78, 36);