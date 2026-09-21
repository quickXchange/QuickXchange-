-- Exact, idempotent recovery for Manual Swap O474713027.
-- The order is never updated here. This records independently verified chain
-- evidence so the regular worker must revalidate the receipt, canonical block,
-- and confirmations before applying the normal lifecycle.
DO $$
DECLARE
  v_network_id text;
  v_asset_id uuid;
  v_watch_id uuid;
  v_observation_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM exchange_orders
    WHERE id = 'O474713027'
      AND type = 'manual'
      AND status = 'awaiting funds'
      AND manual_settlement_state = 'awaiting_funds'
      AND funding_provider_source = 'manual'
      AND funding_status = 'ready_manual'
      AND upper(from_asset) = 'USDT'
      AND upper(from_network) = 'BEP20'
      AND amount = 12
      AND lower(deposit_address) = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
      AND created_at = '2026-09-21 23:40:27.738+00'::timestamptz
  ) THEN
    RETURN;
  END IF;

  UPDATE blockchain_monitor_networks
  SET
    endpoint_secret_ref = 'BSC_MONITOR_RPC_URL',
    provider_kind = 'rpc',
    enabled = true,
    updated_at = now()
  WHERE network_code = 'BEP20'
    AND adapter_kind = 'evm'
    AND lower(chain_id) = '0x38'
    AND confirmations_required = 15
    AND finality_policy = 'confirmations';

  SELECT id INTO v_network_id
  FROM blockchain_monitor_networks
  WHERE network_code = 'BEP20'
    AND adapter_kind = 'evm'
    AND lower(chain_id) = '0x38'
    AND provider_kind = 'rpc'
    AND enabled = true
    AND endpoint_secret_ref = 'BSC_MONITOR_RPC_URL'
    AND confirmations_required = 15
    AND finality_policy = 'confirmations';
  IF v_network_id IS NULL THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: incompatible network configuration';
  END IF;

  SELECT id INTO v_asset_id
  FROM blockchain_monitor_assets
  WHERE monitor_network_id = v_network_id
    AND asset_network_id = 'usdt-bep20'
    AND identity_kind = 'token'
    AND lower(contract_or_mint) = '0x55d398326f99059ff775485246999027b3197955'
    AND decimals = 18;
  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: incompatible USDT identity';
  END IF;

  UPDATE blockchain_monitor_assets
  SET enabled = true, updated_at = now()
  WHERE id = v_asset_id AND enabled = false;

  INSERT INTO blockchain_monitor_watches (
    order_id, monitor_network_id, monitor_asset_id, asset_network_id,
    expected_amount, receiving_address, memo_or_tag, identity_kind,
    contract_or_mint, decimals, order_created_at, start_cursor, current_cursor,
    registration_state, registration_reason, active
  ) VALUES (
    'O474713027', v_network_id, v_asset_id, 'usdt-bep20',
    12, '0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb', NULL, 'token',
    '0x55d398326f99059ff775485246999027b3197955', 18,
    '2026-09-21 23:40:27.738+00'::timestamptz, NULL, NULL, 'active',
    'Verified receipt recovery; inactive to prevent unbounded rescanning.', false
  ) ON CONFLICT (order_id) DO NOTHING;

  UPDATE blockchain_monitor_watches
  SET
    registration_state = 'active',
    registration_reason = 'Verified receipt recovery; inactive to prevent unbounded rescanning.',
    active = false,
    start_cursor = NULL,
    current_cursor = NULL,
    updated_at = now()
  WHERE order_id = 'O474713027'
    AND monitor_network_id = v_network_id
    AND monitor_asset_id = v_asset_id
    AND asset_network_id = 'usdt-bep20'
    AND expected_amount = 12
    AND lower(receiving_address) = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
    AND memo_or_tag IS NULL
    AND identity_kind = 'token'
    AND lower(contract_or_mint) = '0x55d398326f99059ff775485246999027b3197955'
    AND decimals = 18
    AND order_created_at = '2026-09-21 23:40:27.738+00'::timestamptz
    AND active = false;

  SELECT id INTO v_watch_id
  FROM blockchain_monitor_watches
  WHERE order_id = 'O474713027'
    AND monitor_network_id = v_network_id
    AND monitor_asset_id = v_asset_id
    AND registration_state = 'active'
    AND registration_reason = 'Verified receipt recovery; inactive to prevent unbounded rescanning.'
    AND active = false
    AND start_cursor IS NULL
    AND current_cursor IS NULL;
  IF v_watch_id IS NULL THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: immutable watch mismatch';
  END IF;

  INSERT INTO blockchain_monitor_observations (
    monitor_network_id, monitor_asset_id, transaction_hash, event_index,
    from_address, to_address, amount, block_reference, block_hash,
    confirmations, finalized, block_timestamp, raw_payload, payload_digest
  ) VALUES (
    v_network_id, v_asset_id,
    '0x174c2400f9bd29feee85adc342f6b07657fb33582c4f043c74e8ee5ee0fcb58c',
    '0x174c2400f9bd29feee85adc342f6b07657fb33582c4f043c74e8ee5ee0fcb58c:132:' || v_asset_id,
    '0x0d0707963952f2fba59dd06f2b425ace40b492fe',
    '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb',
    12000000000000000000, '123271018',
    '0x94f95a106835aab79b14eae263ab8823e32781f1661534664e0f4d15c4068644',
    0, false, '2026-09-21 23:42:15+00'::timestamptz,
    jsonb_build_object(
      'source', 'evm-json-rpc',
      'identityKind', 'token',
      'contractOrMint', '0x55d398326f99059ff775485246999027b3197955',
      'decimals', 18,
      'receiptStatus', '0x1',
      'logIndex', 132,
      'recoveryBoundary', '2026-09-21 23:40:27.738+00'::timestamptz
    ),
    '897e695668f705775f2295d7fbda3fcb92f059499d54bb942150d8b93a197f11'
  ) ON CONFLICT (monitor_network_id, transaction_hash, event_index, monitor_asset_id)
  DO NOTHING;

  SELECT id INTO v_observation_id
  FROM blockchain_monitor_observations
  WHERE monitor_network_id = v_network_id
    AND monitor_asset_id = v_asset_id
    AND transaction_hash = '0x174c2400f9bd29feee85adc342f6b07657fb33582c4f043c74e8ee5ee0fcb58c'
    AND event_index = '0x174c2400f9bd29feee85adc342f6b07657fb33582c4f043c74e8ee5ee0fcb58c:132:' || v_asset_id
    AND lower(from_address) = '0x0d0707963952f2fba59dd06f2b425ace40b492fe'
    AND lower(to_address) = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
    AND amount = 12000000000000000000
    AND block_reference = '123271018'
    AND lower(block_hash) = '0x94f95a106835aab79b14eae263ab8823e32781f1661534664e0f4d15c4068644'
    AND block_timestamp = '2026-09-21 23:42:15+00'::timestamptz;
  IF v_observation_id IS NULL THEN
    RAISE EXCEPTION 'BEP20 recovery aborted: immutable evidence mismatch';
  END IF;

  INSERT INTO blockchain_monitor_matches (
    watch_id, observation_id, order_id, state, match_basis,
    confirmations, confirmations_required
  ) VALUES (
    v_watch_id, v_observation_id, 'O474713027', 'confirming',
    jsonb_build_object(
      'asset', 'usdt-bep20',
      'address', '0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb',
      'amount', 12000000000000000000,
      'transactionHash', '0x174c2400f9bd29feee85adc342f6b07657fb33582c4f043c74e8ee5ee0fcb58c',
      'recoveryBoundary', '2026-09-21 23:40:27.738+00'::timestamptz
    ),
    0, 15
  ) ON CONFLICT (observation_id, watch_id) DO NOTHING;

  UPDATE blockchain_monitor_registration_gaps
  SET resolved_at = now(), resolved_by = 'verified-receipt-recovery'
  WHERE order_id = 'O474713027'
    AND resolved_at IS NULL
    AND EXISTS (
      SELECT 1 FROM blockchain_monitor_matches
      WHERE order_id = 'O474713027'
        AND state = 'confirming'
    );
END $$;