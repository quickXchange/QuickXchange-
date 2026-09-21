-- Exact, idempotent recovery for Manual Swap O180006775.
-- This never updates the order. It records independently verified immutable
-- evidence and leaves the normal worker to revalidate finality and apply state.
DO $$
DECLARE
  network_id text;
  asset_id uuid;
  watch_id uuid;
  observation_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM exchange_orders
    WHERE id = 'O180006775'
      AND type = 'manual'
      AND status = 'awaiting funds'
      AND manual_settlement_state = 'awaiting_funds'
      AND upper(from_asset) = 'USDT'
      AND upper(from_network) = 'BEP20'
      AND amount = 10
      AND lower(deposit_address) = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
      AND created_at = '2026-09-21 09:11:27.822+00'::timestamptz
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO network_id
  FROM blockchain_monitor_networks
  WHERE network_code = 'BEP20'
    AND adapter_kind = 'evm'
    AND lower(chain_id) = '0x38'
    AND provider_kind = 'rpc'
    AND enabled = true
    AND endpoint_secret_ref = 'BSC_MONITOR_RPC_URL'
    AND confirmations_required = 15
    AND finality_policy = 'confirmations';
  IF network_id IS NULL THEN
    RAISE EXCEPTION 'Live BEP20 recovery aborted: incompatible network configuration';
  END IF;

  SELECT id INTO asset_id
  FROM blockchain_monitor_assets
  WHERE monitor_network_id = network_id
    AND asset_network_id = 'usdt-bep20'
    AND identity_kind = 'token'
    AND lower(contract_or_mint) = '0x55d398326f99059ff775485246999027b3197955'
    AND decimals = 18;
  IF asset_id IS NULL THEN
    RAISE EXCEPTION 'Live BEP20 recovery aborted: incompatible USDT identity';
  END IF;

  UPDATE blockchain_monitor_assets SET enabled = true, updated_at = now()
  WHERE id = asset_id AND enabled = false;

  INSERT INTO blockchain_monitor_watches (
    order_id, monitor_network_id, monitor_asset_id, asset_network_id,
    expected_amount, receiving_address, memo_or_tag, identity_kind,
    contract_or_mint, decimals, order_created_at, registration_state,
    registration_reason, active
  ) VALUES (
    'O180006775', network_id, asset_id, 'usdt-bep20',
    10, '0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb', NULL, 'token',
    '0x55d398326f99059ff775485246999027b3197955', 18,
    '2026-09-21 09:11:27.822+00'::timestamptz, 'active',
    'Verified receipt recovery; inactive to prevent unbounded rescanning.', false
  ) ON CONFLICT (order_id) DO NOTHING;

  SELECT id INTO watch_id FROM blockchain_monitor_watches
  WHERE order_id = 'O180006775'
    AND monitor_network_id = network_id
    AND monitor_asset_id = asset_id
    AND expected_amount = 10
    AND lower(receiving_address) = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
    AND active = false;
  IF watch_id IS NULL THEN
    RAISE EXCEPTION 'Live BEP20 recovery aborted: immutable watch mismatch';
  END IF;

  INSERT INTO blockchain_monitor_observations (
    monitor_network_id, monitor_asset_id, transaction_hash, event_index,
    from_address, to_address, amount, block_reference, block_hash,
    confirmations, finalized, block_timestamp, raw_payload, payload_digest
  ) VALUES (
    network_id, asset_id,
    '0x5e146076f9a16ddb8b76681536b9e021cde019def7fede9be0cb84687b9ac365',
    '0x5e146076f9a16ddb8b76681536b9e021cde019def7fede9be0cb84687b9ac365:255:' || asset_id,
    '0x0d0707963952f2fba59dd06f2b425ace40b492fe',
    '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb',
    10000000000000000000, '123156194',
    '0x1d0658b484110cf3b920960523c4e75a1aa92b099aa4e9257b4cfa6a92e8e01f',
    0, false, '2026-09-21 09:20:40+00'::timestamptz,
    jsonb_build_object(
      'source', 'evm-json-rpc', 'identityKind', 'token',
      'contractOrMint', '0x55d398326f99059ff775485246999027b3197955',
      'decimals', 18, 'receiptStatus', '0x1', 'logIndex', 255,
      'recoveryBoundary', '2026-09-21 09:11:27.822+00'::timestamptz
    ),
    'a4ea23b326a451b1c18fa8892e97050218b152231705e5b6232661c1aabde67c'
  ) ON CONFLICT (monitor_network_id, transaction_hash, event_index, monitor_asset_id)
  DO NOTHING;

  SELECT id INTO observation_id FROM blockchain_monitor_observations
  WHERE monitor_network_id = network_id
    AND monitor_asset_id = asset_id
    AND transaction_hash = '0x5e146076f9a16ddb8b76681536b9e021cde019def7fede9be0cb84687b9ac365'
    AND event_index = '0x5e146076f9a16ddb8b76681536b9e021cde019def7fede9be0cb84687b9ac365:255:' || asset_id
    AND lower(to_address) = '0x961ffd69412bdd402b8a63fc67d5d7f1a105abdb'
    AND amount = 10000000000000000000
    AND block_reference = '123156194'
    AND lower(block_hash) = '0x1d0658b484110cf3b920960523c4e75a1aa92b099aa4e9257b4cfa6a92e8e01f';
  IF observation_id IS NULL THEN
    RAISE EXCEPTION 'Live BEP20 recovery aborted: immutable evidence mismatch';
  END IF;

  INSERT INTO blockchain_monitor_matches (
    watch_id, observation_id, order_id, state, match_basis,
    confirmations, confirmations_required
  ) VALUES (
    watch_id, observation_id, 'O180006775', 'confirming',
    jsonb_build_object(
      'asset', 'usdt-bep20',
      'address', '0x961fFd69412BdD402B8a63FC67D5d7f1A105abDb',
      'amount', 10000000000000000000,
      'transactionHash', '0x5e146076f9a16ddb8b76681536b9e021cde019def7fede9be0cb84687b9ac365',
      'recoveryBoundary', '2026-09-21 09:11:27.822+00'::timestamptz
    ),
    0, 15
  ) ON CONFLICT (observation_id, watch_id) DO NOTHING;

  UPDATE blockchain_monitor_registration_gaps
  SET resolved_at = now(), resolved_by = 'verified-receipt-recovery'
  WHERE order_id = 'O180006775' AND resolved_at IS NULL;
END $$;