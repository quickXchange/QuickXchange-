INSERT INTO "affiliate_program_settings" (
  "version",
  "enabled",
  "quickex_enabled",
  "manual_enabled",
  "commission_rate",
  "minimum_eligible_usd",
  "payout_minimum_usd",
  "transaction_cap_usd",
  "cookie_duration_days",
  "created_by"
)
SELECT
  1,
  false,
  false,
  false,
  0,
  0,
  0,
  NULL,
  30,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "affiliate_program_settings"
);