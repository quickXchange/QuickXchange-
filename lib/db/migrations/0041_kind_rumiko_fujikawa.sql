ALTER TABLE "affiliate_program_settings" ALTER COLUMN "enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "affiliate_program_settings" ALTER COLUMN "quickex_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "affiliate_program_settings" ALTER COLUMN "manual_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "affiliate_program_settings" ALTER COLUMN "commission_rate" SET DEFAULT '0.01';--> statement-breakpoint
WITH "latest" AS (
  SELECT *
  FROM "affiliate_program_settings"
  ORDER BY "version" DESC
  LIMIT 1
),
"activated" AS (
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
    true,
    true,
    true,
    '0.01',
    "minimum_eligible_usd",
    "payout_minimum_usd",
    "transaction_cap_usd",
    "cookie_duration_days",
    NULL
  FROM "latest"
  WHERE NOT (
    "enabled"
    AND "quickex_enabled"
    AND "manual_enabled"
    AND "commission_rate" = '0.01'
  )
  RETURNING "id", "version"
)
INSERT INTO "affiliate_audit_logs" (
  "action",
  "actor_type",
  "target_id",
  "details"
)
SELECT
  'settings.automated_activation',
  'system',
  "id"::text,
  jsonb_build_object('version', "version", 'commissionRate', '0.01')
FROM "activated";