-- Forward repair for installations where the provider-owned aggregate was
-- backfilled before customer_clerk_user_id existed on quickex_orders.
UPDATE quickex_orders q
SET customer_clerk_user_id = e.customer_clerk_user_id
FROM exchange_orders e
WHERE q.legacy_order_id = e.id
  AND e.type = 'instant'
  AND e.provider = 'Quickex'
  AND q.customer_clerk_user_id IS NULL
  AND e.customer_clerk_user_id IS NOT NULL;