WITH methods AS (
  SELECT id, COALESCE(field_definitions, '[]'::jsonb) AS definitions
  FROM payment_methods
  WHERE execution_mode = 'manual'
),
items AS (
  SELECT m.id, e.value, e.ordinality,
    CASE
      WHEN e.value->>'key' IN ('name','recipient_name','account_holder_name')
        OR e.value->>'type' = 'account-name' THEN 'name'
      WHEN e.value->>'key' IN ('bank_detail','iban','bank_account_number')
        OR e.value->>'type' IN ('account-iban','account-number') THEN 'bank_detail'
      WHEN e.value->>'key' = 'bank_name' THEN 'bank_name'
      WHEN e.value->>'key' = 'payment_description' THEN 'payment_description'
      WHEN e.value->>'key' = 'telegram_or_whatsapp' THEN 'telegram_or_whatsapp'
    END AS logical_key
  FROM methods m
  CROSS JOIN LATERAL jsonb_array_elements(m.definitions) WITH ORDINALITY AS e(value, ordinality)
),
kept AS (
  SELECT id, value, ordinality, logical_key
  FROM items
),
base AS (
  SELECT m.id,
    COALESCE(jsonb_agg(
      CASE
        WHEN k.value ? 'enabled' THEN k.value
        WHEN k.logical_key IS NOT NULL
          THEN k.value || '{"enabled":true,"direction":"both"}'::jsonb
        ELSE k.value || '{"enabled":true}'::jsonb
      END
      ORDER BY k.ordinality
    ) FILTER (WHERE k.value IS NOT NULL), '[]'::jsonb) AS definitions
  FROM methods m LEFT JOIN kept k ON k.id = m.id
  GROUP BY m.id
),
merged AS (
  SELECT b.id,
    b.definitions ||
    CASE WHEN NOT EXISTS (SELECT 1 FROM kept k WHERE k.id=b.id AND k.logical_key='name')
      THEN jsonb_build_array(jsonb_build_object('key','name','type','account-name','label','Name','direction','both','required',true,'min',2,'max',140,'enabled',true)) ELSE '[]'::jsonb END ||
    CASE WHEN NOT EXISTS (SELECT 1 FROM kept k WHERE k.id=b.id AND k.logical_key='bank_detail')
      THEN jsonb_build_array(jsonb_build_object('key','bank_detail','type','account-number','label','Bank detail (IBAN or account number)','direction','both','required',true,'min',2,'max',64,'enabled',true)) ELSE '[]'::jsonb END ||
    CASE WHEN NOT EXISTS (SELECT 1 FROM kept k WHERE k.id=b.id AND k.logical_key='bank_name')
      THEN jsonb_build_array(jsonb_build_object('key','bank_name','type','short-text','label','Bank name','direction','both','required',true,'min',2,'max',140,'enabled',true)) ELSE '[]'::jsonb END ||
    CASE WHEN NOT EXISTS (SELECT 1 FROM kept k WHERE k.id=b.id AND k.logical_key='payment_description')
      THEN jsonb_build_array(jsonb_build_object('key','payment_description','type','long-text','label','Payment description','direction','both','required',false,'max',500,'enabled',true)) ELSE '[]'::jsonb END ||
    CASE WHEN NOT EXISTS (SELECT 1 FROM kept k WHERE k.id=b.id AND k.logical_key='telegram_or_whatsapp')
      THEN jsonb_build_array(jsonb_build_object('key','telegram_or_whatsapp','type','short-text','label','Your Telegram or WhatsApp','direction','both','required',false,'max',100,'enabled',true)) ELSE '[]'::jsonb END AS definitions
  FROM base b
)
UPDATE payment_methods p
SET field_definitions = m.definitions, updated_at = now()
FROM merged m WHERE p.id = m.id;