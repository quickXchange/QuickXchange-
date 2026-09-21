ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "email_templates" jsonb DEFAULT '{}'::jsonb NOT NULL;