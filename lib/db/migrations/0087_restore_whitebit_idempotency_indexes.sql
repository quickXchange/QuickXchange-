CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_address_customer_asset_uidx"
ON "whitebit_deposit_addresses" ("customer_id", "ticker", "network");

CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_history_checkpoint_address_uidx"
ON "whitebit_history_checkpoints" ("address_id");

CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_order_history_checkpoint_address_uidx"
ON "whitebit_order_history_checkpoints" ("order_address_id");

CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_webhook_envelope_uidx"
ON "whitebit_webhook_deliveries" ("envelope_id");

CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_webhook_nonce_uidx"
ON "whitebit_webhook_deliveries" ("nonce");

CREATE UNIQUE INDEX IF NOT EXISTS "whitebit_order_address_order_uidx"
ON "whitebit_order_addresses" ("order_id");