-- Seed the official footer social links once. The durable audit marker makes
-- an explicit replay harmless, including after an operator later removes one.
DO $$
DECLARE
  migration_actor constant text := 'system:migration-0133';
  marker_action constant text := 'site_social_trust.official_links_migrated';
  official record;
  inserted_link record;
  latest_revision "site_publication_revisions"%ROWTYPE;
  publication_id uuid;
  next_order integer;
  additions jsonb;
  updated_social_trust jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "site_content_audit_logs"
    WHERE "action" = marker_action AND "actor_id" = migration_actor
  ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(2026083153);
  SELECT COALESCE(MAX("sort_order") + 1, 0)
    INTO next_order
  FROM "site_social_trust_links"
  WHERE "removed_at" IS NULL;

  FOR official IN
    SELECT *
    FROM (VALUES
      ('Facebook', 'https://www.facebook.com/share/1DzDXFvLXi/', 0),
      ('Instagram', 'https://www.instagram.com/quick_x_change?stkn=eTYweW13dzZieTl0', 1),
      ('Medium', 'https://medium.com/@quickchange1001', 2),
      ('CoinMarketCap Community', 'https://coinmarketcap.com/community/profile/Quick_X_change01/', 3),
      ('X', 'https://x.com/quick_change01', 4)
    ) AS links(name, href, position)
    ORDER BY position
  LOOP
    -- Never change or duplicate an active operator-managed platform.
    -- Removed rows are ignored so these initial defaults still appear.
    IF NOT EXISTS (
      SELECT 1
      FROM "site_social_trust_links"
      WHERE "removed_at" IS NULL
        AND "group_name" = 'social'
        AND (lower("name") = lower(official.name) OR "href" = official.href)
    ) THEN
      INSERT INTO "site_social_trust_links"
        ("group_name", "name", "href", "object_path", "light_object_path",
         "dark_object_path", "appearance", "display_mode", "sort_order",
         "enabled", "created_by")
      VALUES
        ('social', official.name, official.href, NULL, NULL, NULL,
         'auto', 'icon-only', next_order + official.position,
         TRUE, migration_actor);
    END IF;
  END LOOP;

  SELECT *
    INTO latest_revision
  FROM "site_publication_revisions"
  ORDER BY "version" DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Add active official rows only when the newest immutable snapshot does
    -- not already contain that URL. Every other snapshot field stays intact.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', links."id",
      'group', links."group_name",
      'name', links."name",
      'href', links."href",
      'objectPath', links."object_path",
      'lightObjectPath', links."light_object_path",
      'darkObjectPath', links."dark_object_path",
      'appearance', links."appearance",
      'displayMode', links."display_mode",
      'sortOrder', COALESCE(links."sort_order", 0),
      'enabled', links."enabled",
      'removedAt', NULL,
      'createdAt', links."created_at"
    ) ORDER BY links."sort_order" NULLS LAST, links."id"), '[]'::jsonb)
      INTO additions
    FROM "site_social_trust_links" AS links
    WHERE links."removed_at" IS NULL
      AND links."href" IN (
        'https://www.facebook.com/share/1DzDXFvLXi/',
        'https://www.instagram.com/quick_x_change?stkn=eTYweW13dzZieTl0',
        'https://medium.com/@quickchange1001',
        'https://coinmarketcap.com/community/profile/Quick_X_change01/',
        'https://x.com/quick_change01'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(latest_revision."social_trust"->'items', '[]'::jsonb)
        ) AS item
         WHERE item->>'group' = 'social'
           AND COALESCE((item->>'enabled')::boolean, TRUE)
           AND item->>'removedAt' IS NULL
           AND (
             item->>'href' = links."href"
             OR lower(item->>'name') = lower(links."name")
           )
      );

    IF jsonb_array_length(additions) > 0 THEN
      updated_social_trust := latest_revision."social_trust" ||
        jsonb_build_object(
          'items',
          COALESCE(latest_revision."social_trust"->'items', '[]'::jsonb) || additions
        );

      INSERT INTO "site_publication_revisions"
        ("version", "navigation", "partner_logos", "partner_logo_settings",
         "social_trust", "created_by", "published_by")
      VALUES
        (latest_revision."version" + 1, latest_revision."navigation",
         latest_revision."partner_logos", latest_revision."partner_logo_settings",
         updated_social_trust, migration_actor, migration_actor)
      RETURNING "id" INTO publication_id;

      INSERT INTO "site_content_audit_logs"
        ("action", "actor_id", "publication_revision_id", "details")
      VALUES (
        'site_publication.official_social_links_seeded',
        migration_actor,
        publication_id,
        jsonb_build_object(
          'version', latest_revision."version" + 1,
          'source', 'quickxchange-official-social-links',
          'hrefs', additions
        )
      );
    END IF;
  END IF;

  -- This completion record prevents replay from resurrecting links removed
  -- after migration 0133. It also documents the editable-row seed.
  INSERT INTO "site_content_audit_logs"
    ("action", "actor_id", "publication_revision_id", "details")
  VALUES (
    marker_action,
    migration_actor,
    publication_id,
    jsonb_build_object(
      'source', 'quickxchange-official-social-links',
      'publicationRevisionCreated', publication_id IS NOT NULL
    )
  );
END $$;