-- Team members and permissions foundation. Every statement is safe to replay.
CREATE TABLE IF NOT EXISTS "team_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "permission_keys" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_roles_normalized_name_unique"
  ON "team_roles" ("normalized_name");

-- Persist the first migration's cutoff so replaying this SQL can never
-- classify a subsequently-created no-role invitation as a legacy operator.
CREATE TABLE IF NOT EXISTS "team_permission_migration_meta" (
  "id" boolean PRIMARY KEY DEFAULT true,
  "legacy_cutoff" timestamptz NOT NULL
);
INSERT INTO "team_permission_migration_meta" ("id", "legacy_cutoff")
VALUES (true, clock_timestamp())
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "desk_operators"
  ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "custom_role_id" uuid,
  ADD COLUMN IF NOT EXISTS "permission_allows" text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS "permission_denies" text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS "legacy_permission_eligible" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "desk_operators_custom_role_idx"
  ON "desk_operators" ("custom_role_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'desk_operators_custom_role_id_team_roles_id_fk'
  ) THEN
    ALTER TABLE "desk_operators"
      ADD CONSTRAINT "desk_operators_custom_role_id_team_roles_id_fk"
      FOREIGN KEY ("custom_role_id") REFERENCES "team_roles" ("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- A display name did not exist in the legacy model. Deriving it from the
-- existing email keeps all rows usable without inventing personal data.
UPDATE "desk_operators"
SET "name" = split_part("email", '@', 1)
WHERE "name" = '';

-- Existing operators retain their previous desk access. New members are
-- intentionally deny-by-default until an owner chooses a role or overrides.
INSERT INTO "team_roles" (
  "name", "normalized_name", "description", "permission_keys"
)
VALUES (
  'Legacy Operator',
  'legacy-operator',
  'Compatibility role for operators created before granular permissions.',
  ARRAY[
    'orders.view', 'orders.details', 'orders.status',
    'orders.confirm_payment', 'orders.complete', 'orders.cancel',
    'orders.notes', 'orders.search', 'orders.export',
    'customers.view', 'customers.edit',
    'crypto_assets.view', 'crypto_assets.manage',
    'crypto_networks.view', 'crypto_networks.manage',
    'payment_methods.view', 'payment_methods.manage',
    'pricing.view', 'pricing.manage',
    'receiving_wallets.view',
    'currencies.view', 'currencies.manage',
    'integrations.view',
    'blog.view', 'blog.manage',
    'languages.view', 'languages.manage',
    'social_media.view', 'social_media.manage',
    'site_settings.view', 'site_settings.manage',
    'statistics.view', 'statistics.export',
    'affiliates.view', 'affiliates.manage'
  ]::text[]
)
ON CONFLICT ("normalized_name") DO NOTHING;

UPDATE "desk_operators" AS operator
SET "legacy_permission_eligible" = true
WHERE operator."role" <> 'owner'
  AND operator."legacy_permission_eligible" = false
  AND operator."status" = 'active'
  AND operator."invited_by" IS NULL
  AND operator."created_at" < (SELECT "legacy_cutoff" FROM "team_permission_migration_meta" WHERE "id" = true);

UPDATE "desk_operators" AS operator
SET "custom_role_id" = role."id"
FROM "team_roles" AS role
WHERE role."normalized_name" = 'legacy-operator'
  AND operator."role" <> 'owner'
  AND operator."custom_role_id" IS NULL
  AND operator."legacy_permission_eligible" = true;

-- Owner is a reserved role. This guard prevents both demotion and promotion
-- through a direct SQL write by the runtime application role.
CREATE OR REPLACE FUNCTION desk_operators_reject_owner_role_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."role" = 'owner' AND NEW."role" <> 'owner' THEN
    RAISE EXCEPTION 'owner role is immutable' USING ERRCODE = '42501';
  ELSIF OLD."role" <> 'owner' AND NEW."role" = 'owner' THEN
    RAISE EXCEPTION 'owner role cannot be assigned through member updates' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS desk_operators_owner_role_immutable ON "desk_operators";
CREATE TRIGGER desk_operators_owner_role_immutable
BEFORE UPDATE OF "role" ON "desk_operators"
FOR EACH ROW EXECUTE FUNCTION desk_operators_reject_owner_role_mutation();

CREATE TABLE IF NOT EXISTS "admin_activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_operator_id" uuid,
  "actor_member_name" text NOT NULL DEFAULT '',
  "actor_member_email" text NOT NULL DEFAULT '',
  "actor_role" text NOT NULL DEFAULT 'operator',
  "permission_key" text NOT NULL,
  "action" text NOT NULL,
  "section" text NOT NULL,
  "entity_kind" text,
  "entity_id" text,
  "safe_label" text,
  "request_id" text,
  "outcome" text NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_activity_events_permission_key_safe'
  ) THEN
    ALTER TABLE "admin_activity_events"
      ADD CONSTRAINT "admin_activity_events_permission_key_safe"
      CHECK ("permission_key" ~ '^[a-z][a-z0-9_.-]*$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_activity_events_action_safe'
  ) THEN
    ALTER TABLE "admin_activity_events"
      ADD CONSTRAINT "admin_activity_events_action_safe"
      CHECK ("action" ~ '^[a-z][a-z0-9_.-]*$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "admin_activity_events_occurred_at_id_idx"
  ON "admin_activity_events" ("occurred_at", "id");
CREATE INDEX IF NOT EXISTS "admin_activity_events_actor_occurred_at_idx"
  ON "admin_activity_events" ("actor_operator_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "admin_activity_events_section_occurred_at_idx"
  ON "admin_activity_events" ("section", "occurred_at");
CREATE INDEX IF NOT EXISTS "admin_activity_events_permission_occurred_at_idx"
  ON "admin_activity_events" ("permission_key", "occurred_at");

-- Runtime writes are append-only. Database owners/test maintenance roles may
-- still clean rows using the existing privileged test-database convention.
CREATE OR REPLACE FUNCTION admin_activity_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'quickex_app_runtime' THEN
    RAISE EXCEPTION 'admin activity events are append-only' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS admin_activity_events_append_only ON "admin_activity_events";
CREATE TRIGGER admin_activity_events_append_only
BEFORE UPDATE OR DELETE ON "admin_activity_events"
FOR EACH ROW EXECUTE FUNCTION admin_activity_events_reject_mutation();