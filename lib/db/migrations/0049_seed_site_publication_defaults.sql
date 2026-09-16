-- Preserve the pre-site-content footer navigation on first deployment. This
-- migration is intentionally idempotent and never overwrites an owner
-- publication or operator-managed draft rows.
DO $$
DECLARE
  publication_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "site_publication_revisions") THEN
    IF NOT EXISTS (SELECT 1 FROM "site_nav_links") THEN
      INSERT INTO "site_nav_links" ("id", "label", "href", "enabled", "header", "footer", "sort_order", "updated_by")
      VALUES
        ('10000000-0000-4000-8000-000000000001', 'Home', '/', true, false, true, 0, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000002', 'Convert', '/#exchange-widget', true, false, true, 10, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000003', 'Swap', '/#exchange-widget', true, false, true, 20, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000004', 'Market Rates', '/#market-rates', true, false, true, 30, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000005', 'About Us', '/#why-choose-us', true, false, true, 40, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000006', 'Affiliate Program', '/account/affiliate', true, false, true, 50, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000007', 'Operations', '/admin', true, false, true, 60, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000008', 'Track an order', '/status', true, false, true, 70, 'system:legacy-default'),
        ('10000000-0000-4000-8000-000000000009', 'Sign In', '/sign-in', true, false, true, 80, 'system:legacy-default');
    END IF;

    INSERT INTO "site_publication_revisions"
      ("version", "navigation", "partner_logos", "created_by", "published_by")
    SELECT
      1,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', "id",
        'label', "label",
        'href', "href",
        'enabled', "enabled",
        'header', "header",
        'footer', "footer",
        'sortOrder', "sort_order"
      ) ORDER BY "sort_order", "id"), '[]'::jsonb),
      '[]'::jsonb,
      'system:legacy-default',
      'system:legacy-default'
    FROM "site_nav_links"
    RETURNING "id" INTO publication_id;

    INSERT INTO "site_content_audit_logs"
      ("action", "actor_id", "publication_revision_id", "details")
    VALUES (
      'site_publication.seeded',
      'system:legacy-default',
      publication_id,
      jsonb_build_object('version', 1, 'source', 'legacy-public-navigation')
    );
  END IF;
END $$;