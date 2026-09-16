-- Repair installations that ran the initial Quickex-owned backfill before
-- recoverable customer identity fields were copied into the new aggregate.
UPDATE quickex_orders q
SET customer_email = e.customer_email,
    customer_name = e.customer_name
FROM exchange_orders e
WHERE q.legacy_order_id = e.id
  AND e.type = 'instant'
  AND e.provider = 'Quickex'
  AND q.customer_email = '';