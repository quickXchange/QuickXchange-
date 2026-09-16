-- Quickex rows are projected separately without changing manual-desk rows or
-- the established exchange_orders compatibility/history surface.
CREATE TABLE IF NOT EXISTS quickex_orders (
  legacy_order_id text PRIMARY KEY,
  provider_order_id text NOT NULL DEFAULT '',
  provider_reference text NOT NULL DEFAULT '',
  client_request_id text UNIQUE,
  quote_id text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT 'Guest',
  status text NOT NULL,
  provider_state text NOT NULL DEFAULT '',
  route jsonb NOT NULL,
  amounts jsonb NOT NULL,
  addresses jsonb NOT NULL,
  outcome_unknown boolean NOT NULL DEFAULT false,
  record_version integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS quickex_orders_status_created_at_idx
  ON quickex_orders (status, created_at);
CREATE INDEX IF NOT EXISTS quickex_orders_provider_order_id_idx
  ON quickex_orders (provider_order_id);

DROP TRIGGER IF EXISTS exchange_orders_quickex_projection ON exchange_orders;
DROP FUNCTION IF EXISTS project_quickex_order();

-- Safe, idempotent backfill: Manual Swap and every non-Quickex row are excluded.
INSERT INTO quickex_orders (
  legacy_order_id, provider_order_id, provider_reference, status, provider_state,
  customer_email, customer_name, route, amounts, addresses, outcome_unknown,
  created_at, updated_at
)
SELECT id, provider_order_id, provider_reference, status, provider_state,
  customer_email, customer_name,
  jsonb_build_object('fromAsset', from_asset, 'fromNetwork', from_network,
    'toAsset', to_asset, 'toNetwork', to_network, 'rateMode', rate_mode),
  jsonb_build_object('amount', amount, 'receiveAmount', receive_amount,
    'claimedDepositAmount', provider_claimed_deposit_amount,
    'expectedReceiveAmount', provider_expected_receive_amount,
    'paidAmount', provider_paid_amount),
  jsonb_build_object('destinationAddress', destination_address,
    'destinationMemo', destination_memo, 'refundAddress', refund_address,
    'refundMemo', refund_memo, 'depositAddress', deposit_address, 'depositMemo', deposit_memo),
  outcome_unknown, created_at, updated_at
FROM exchange_orders
WHERE type = 'instant' AND provider = 'Quickex'
ON CONFLICT (legacy_order_id) DO NOTHING;