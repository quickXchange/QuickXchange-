CREATE TABLE "site_publication_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"navigation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"partner_logos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_publication_navigation_array_check" CHECK (jsonb_typeof("site_publication_revisions"."navigation") = 'array'),
	CONSTRAINT "site_publication_partner_logos_array_check" CHECK (jsonb_typeof("site_publication_revisions"."partner_logos") = 'array')
);
--> statement-breakpoint
ALTER TABLE "site_content_audit_logs" ADD COLUMN "publication_revision_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "site_publication_revision_version_uidx" ON "site_publication_revisions" USING btree ("version");--> statement-breakpoint
ALTER TABLE "site_content_audit_logs"
  ADD CONSTRAINT "site_content_audit_logs_publication_revision_id_site_publication_revisions_id_fk"
  FOREIGN KEY ("publication_revision_id") REFERENCES "site_publication_revisions"("id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION site_content_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'site content records are append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS site_content_revisions_append_only ON site_content_revisions;--> statement-breakpoint
CREATE TRIGGER site_content_revisions_append_only
  BEFORE UPDATE OR DELETE ON site_content_revisions
  FOR EACH ROW EXECUTE FUNCTION site_content_reject_mutation();--> statement-breakpoint
DROP TRIGGER IF EXISTS site_content_audit_append_only ON site_content_audit_logs;--> statement-breakpoint
CREATE TRIGGER site_content_audit_append_only
  BEFORE UPDATE OR DELETE ON site_content_audit_logs
  FOR EACH ROW EXECUTE FUNCTION site_content_reject_mutation();--> statement-breakpoint
DROP TRIGGER IF EXISTS site_publication_revisions_append_only ON site_publication_revisions;--> statement-breakpoint
CREATE TRIGGER site_publication_revisions_append_only
  BEFORE UPDATE OR DELETE ON site_publication_revisions
  FOR EACH ROW EXECUTE FUNCTION site_content_reject_mutation();