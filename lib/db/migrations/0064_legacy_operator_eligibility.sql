ALTER TABLE "desk_operators"
  ADD COLUMN IF NOT EXISTS "legacy_permission_eligible" boolean NOT NULL DEFAULT false;

UPDATE "desk_operators" AS operator
SET "legacy_permission_eligible" = true
FROM "team_roles" AS role
WHERE operator."custom_role_id" = role."id"
  AND role."normalized_name" = 'legacy operator'
  AND operator."legacy_permission_eligible" = false;