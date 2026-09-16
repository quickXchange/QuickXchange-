CREATE OR REPLACE FUNCTION affiliate_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'affiliate financial records are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS affiliate_commissions_append_only ON affiliate_commissions;
--> statement-breakpoint
CREATE TRIGGER affiliate_commissions_append_only
BEFORE UPDATE OR DELETE ON affiliate_commissions
FOR EACH ROW EXECUTE FUNCTION affiliate_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS affiliate_audit_logs_append_only ON affiliate_audit_logs;
--> statement-breakpoint
CREATE TRIGGER affiliate_audit_logs_append_only
BEFORE UPDATE OR DELETE ON affiliate_audit_logs
FOR EACH ROW EXECUTE FUNCTION affiliate_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS affiliate_settings_append_only ON affiliate_program_settings;
--> statement-breakpoint
CREATE TRIGGER affiliate_settings_append_only
BEFORE UPDATE OR DELETE ON affiliate_program_settings
FOR EACH ROW EXECUTE FUNCTION affiliate_reject_mutation();