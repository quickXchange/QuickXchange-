ALTER TABLE quickex_orders
  ADD COLUMN IF NOT EXISTS customer_clerk_user_id text;

CREATE INDEX IF NOT EXISTS quickex_orders_customer_clerk_user_id_created_at_idx
  ON quickex_orders (customer_clerk_user_id, created_at);