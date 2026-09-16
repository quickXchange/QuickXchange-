-- Complete the provider-owned aggregate for installations that ran 0023.
ALTER TABLE quickex_orders DROP CONSTRAINT IF EXISTS quickex_orders_legacy_order_id_fkey;
ALTER TABLE quickex_orders ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE quickex_orders ADD COLUMN IF NOT EXISTS quote_id text NOT NULL DEFAULT '';
ALTER TABLE quickex_orders ADD COLUMN IF NOT EXISTS customer_email text NOT NULL DEFAULT '';
ALTER TABLE quickex_orders ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT 'Guest';
ALTER TABLE quickex_orders ADD COLUMN IF NOT EXISTS record_version integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS quickex_orders_client_request_id_idx
  ON quickex_orders (client_request_id);
UPDATE quickex_orders q
SET customer_email = e.customer_email,
    customer_name = e.customer_name
FROM exchange_orders e
WHERE q.legacy_order_id = e.id
  AND e.type = 'instant'
  AND e.provider = 'Quickex'
  AND q.customer_email = '';
DROP TRIGGER IF EXISTS exchange_orders_quickex_projection ON exchange_orders;
DROP FUNCTION IF EXISTS project_quickex_order();