CREATE TABLE IF NOT EXISTS "blog_automation_slots" (
  "occurrence_key" text PRIMARY KEY NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "blog_automation_runs"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_automation_slots_run_uidx"
  ON "blog_automation_slots" ("run_id");