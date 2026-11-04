-- Revenue-only metadata. No customer/order values or existing accounting
-- history are updated. No historical orders are backfilled with today's rates.
ALTER TABLE order_profit_records DROP CONSTRAINT order_profit_records_kind_check;
ALTER TABLE order_profit_records ADD CONSTRAINT order_profit_records_kind_check CHECK (
  (kind IN ('basis', 'completion', 'unavailable') AND basis IS NOT NULL AND execution IS NOT NULL AND amount IS NULL) OR
  (kind = 'adjustment' AND basis IS NULL AND execution IS NULL AND amount IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX order_profit_my_rate_request_idx ON order_profit_rates ((config->>'requestId'))
WHERE config->>'kind' = 'my_rate';
--> statement-breakpoint
CREATE INDEX order_profit_my_rate_current_idx ON order_profit_rates
  ((config->>'asset'), (config->>'currency'), (config->>'network'), effective_at DESC, id DESC)
WHERE config->>'kind' = 'my_rate';
--> statement-breakpoint
CREATE FUNCTION capture_revenue_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  key text;
  facts jsonb;
  moment timestamptz := clock_timestamp();
BEGIN
  IF NEW.status <> 'completed' OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'exchange_orders' THEN
    -- Canonical Convert is captured from quickex_orders, never its mirror.
    IF NEW.type <> 'manual' OR NEW.is_test THEN RETURN NEW; END IF;
    key := 'Swap:' || NEW.id;
    facts := jsonb_build_object(
      'fromAsset', NEW.from_asset, 'fromNetwork', NEW.from_network,
      'toAsset', NEW.to_asset, 'toNetwork', NEW.to_network,
      'amount', coalesce(NEW.sent_amount_override, NEW.amount)::text,
      'receiveAmount', coalesce(NEW.receive_amount_override, NEW.receive_amount)::text,
      'executionVerified', true);
  ELSE
    key := 'Convert:' || NEW.legacy_order_id;
    facts := jsonb_build_object(
      'fromAsset', NEW.route->>'fromAsset', 'fromNetwork', coalesce(NEW.route->>'fromNetwork',''),
      'toAsset', NEW.route->>'toAsset', 'toNetwork', coalesce(NEW.route->>'toNetwork',''),
      'amount', coalesce(nullif(NEW.amounts->>'paidAmount',''), nullif(NEW.amounts->>'providerPaidAmount',''), ''),
      'receiveAmount', coalesce(nullif(NEW.amounts->>'actualReceiveAmount',''), ''),
      'executionVerified', coalesce(nullif(NEW.amounts->>'paidAmount',''), nullif(NEW.amounts->>'providerPaidAmount',''), '0')::numeric > 0
        AND coalesce(nullif(NEW.amounts->>'actualReceiveAmount',''), '0')::numeric > 0);
  END IF;
  -- Freeze the versions visible NOW, not those visible when an asynchronous
  -- worker recovers later. Concurrent uncommitted edits cannot leak backwards.
  facts := facts || jsonb_build_object(
    'assetKinds', jsonb_build_object(
      facts->>'fromAsset', CASE WHEN EXISTS (SELECT 1 FROM fiat_currencies WHERE code = facts->>'fromAsset') THEN 'fiat'
        WHEN EXISTS (SELECT 1 FROM crypto_assets WHERE code = facts->>'fromAsset') THEN 'crypto' ELSE 'unknown' END,
      facts->>'toAsset', CASE WHEN EXISTS (SELECT 1 FROM fiat_currencies WHERE code = facts->>'toAsset') THEN 'fiat'
        WHEN EXISTS (SELECT 1 FROM crypto_assets WHERE code = facts->>'toAsset') THEN 'crypto' ELSE 'unknown' END),
    'rateCandidates', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'config', r.config, 'effectiveAt', r.effective_at)), '[]'::jsonb)
    FROM (
      SELECT DISTINCT ON (config->>'asset', config->>'currency', config->>'network') id, config, effective_at
      FROM order_profit_rates WHERE config->>'kind' = 'my_rate'
      ORDER BY config->>'asset', config->>'currency', config->>'network', effective_at DESC, id DESC
    ) r
  ));
  INSERT INTO order_profit_records
    (order_key, kind, basis, execution, currency, reason, request_id, actor_id, created_at)
  VALUES (key, 'completion', facts, jsonb_build_object('amount', facts->>'amount', 'receiveAmount', facts->>'receiveAmount'),
    '', 'Frozen accounting inputs at first completion', 'completion:' || key, 'revenue-completion', moment)
  ON CONFLICT (request_id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER revenue_swap_completion AFTER UPDATE OF status ON exchange_orders
FOR EACH ROW EXECUTE FUNCTION capture_revenue_completion();
--> statement-breakpoint
CREATE TRIGGER revenue_convert_completion AFTER UPDATE OF status ON quickex_orders
FOR EACH ROW EXECUTE FUNCTION capture_revenue_completion();