ALTER TABLE "affiliate_program_settings" ALTER COLUMN "commission_rate" SET DEFAULT '0.003';--> statement-breakpoint
WITH "latest" AS (
  SELECT *
  FROM "affiliate_program_settings"
  ORDER BY "version" DESC
  LIMIT 1
),
"updated_rate" AS (
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
    "version" + 1,
    "enabled",
    "quickex_enabled",
    "manual_enabled",
    '0.003',
    "minimum_eligible_usd",
    "payout_minimum_usd",
    "transaction_cap_usd",
    "cookie_duration_days",
    NULL
  FROM "latest"
  WHERE "commission_rate" <> '0.003'
  RETURNING "id", "version"
)
INSERT INTO "affiliate_audit_logs" (
  "action",
  "actor_type",
  "target_id",
  "details"
)
SELECT
  'settings.default_rate_updated',
  'system',
  "id"::text,
  jsonb_build_object('version', "version", 'commissionRate', '0.003')
FROM "updated_rate";