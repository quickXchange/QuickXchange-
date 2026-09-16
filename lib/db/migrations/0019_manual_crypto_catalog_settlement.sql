CREATE TABLE IF NOT EXISTS "crypto_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "decimals" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crypto_assets_code_uidx"
  ON "crypto_assets" ("code");
CREATE INDEX IF NOT EXISTS "crypto_assets_enabled_display_order_idx"
  ON "crypto_assets" ("enabled", "display_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crypto_asset_networks" (
  "id" text PRIMARY KEY NOT NULL,
  "asset_id" text NOT NULL REFERENCES "crypto_assets"("id") ON DELETE CASCADE,
  "network_code" text NOT NULL,
  "network_name" text NOT NULL,
  "decimals" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "customer_deposits_enabled" boolean DEFAULT false NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "requires_memo" boolean DEFAULT false NOT NULL,
  "required_confirmations" integer DEFAULT 0 NOT NULL,
  "confirmation_guidance" text,
  "explorer_url_template" text,
  "deposit_instructions" text,
  "deposit_warning" text,
  "shared_deposit_address" text DEFAULT '' NOT NULL,
  "shared_deposit_memo" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crypto_asset_networks_asset_network_code_uidx"
  ON "crypto_asset_networks" ("asset_id", "network_code");
CREATE INDEX IF NOT EXISTS "crypto_asset_networks_asset_display_order_idx"
  ON "crypto_asset_networks" ("asset_id", "enabled", "display_order");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crypto_asset_networks_confirmations_check'
  ) THEN
    ALTER TABLE "crypto_asset_networks"
      ADD CONSTRAINT "crypto_asset_networks_confirmations_check"
      CHECK ("required_confirmations" >= 0);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "manual_settlement_state" text DEFAULT 'not_required' NOT NULL;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "manual_settlement_state_updated_at" timestamp with time zone;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "manual_settlement_started_at" timestamp with time zone;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "manual_settlement_funded_at" timestamp with time zone;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "manual_settlement_paid_at" timestamp with time zone;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "manual_settlement_cancelled_at" timestamp with time zone;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "customer_safe_note" text DEFAULT '' NOT NULL;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "incoming_transaction_reference" text DEFAULT '' NOT NULL;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "outgoing_transaction_reference" text DEFAULT '' NOT NULL;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "funding_details_snapshot" jsonb;
ALTER TABLE "exchange_orders" ADD COLUMN IF NOT EXISTS "customer_details_snapshot" jsonb;
--> statement-breakpoint
INSERT INTO "crypto_assets" ("id", "code", "name", "decimals", "enabled", "display_order")
VALUES
  ('btc', 'BTC', 'Bitcoin', 8, true, 10),
  ('eth', 'ETH', 'Ethereum', 18, true, 20),
  ('usdt', 'USDT', 'Tether', 6, true, 30),
  ('usdc', 'USDC', 'USD Coin', 6, true, 40),
  ('bnb', 'BNB', 'BNB', 18, true, 50),
  ('sol', 'SOL', 'Solana', 9, true, 60),
  ('xrp', 'XRP', 'XRP', 6, true, 70),
  ('xlm', 'XLM', 'Stellar', 7, true, 80),
  ('ton', 'TON', 'Toncoin', 9, true, 90)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Additional desk routes. All begin disabled for customer deposits and with
-- blank addresses; enabling a row is an explicit operator action.
INSERT INTO "crypto_assets" ("id", "code", "name", "decimals", "enabled", "display_order")
VALUES
 ('trx','TRX','TRON',6,true,61),('ltc','LTC','Litecoin',8,true,62),('doge','DOGE','Dogecoin',8,true,63),
 ('bch','BCH','Bitcoin Cash',8,true,64),('ada','ADA','Cardano',6,true,65),('dot','DOT','Polkadot',10,true,66),
 ('avax','AVAX','Avalanche',18,true,67),('pol','POL','Polygon',18,true,68),('dai','DAI','Dai',18,true,69)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "crypto_asset_networks" ("id","asset_id","network_code","network_name","decimals","enabled","customer_deposits_enabled","display_order","requires_memo","required_confirmations","deposit_warning")
VALUES
 ('usdt-ton','usdt','TON','The Open Network',6,true,false,90,true,1,'Deposits are unavailable until an operator configures this route.'),
 ('usdc-bep20','usdc','BEP20','BNB Smart Chain',6,true,false,60,false,15,'Deposits are unavailable until an operator configures this route.'),
 ('trx-tron','trx','TRC20','Tron',6,true,false,10,false,19,'Deposits are unavailable until an operator configures this route.'),
 ('ltc-litecoin','ltc','LTC','Litecoin',8,true,false,10,false,6,'Deposits are unavailable until an operator configures this route.'),
 ('doge-dogecoin','doge','DOGE','Dogecoin',8,true,false,10,false,6,'Deposits are unavailable until an operator configures this route.'),
 ('bch-bitcoin-cash','bch','BCH','Bitcoin Cash',8,true,false,10,false,6,'Deposits are unavailable until an operator configures this route.'),
 ('ada-cardano','ada','ADA','Cardano',6,true,false,10,false,15,'Deposits are unavailable until an operator configures this route.'),
 ('dot-polkadot','dot','DOT','Polkadot',10,true,false,10,false,1,'Deposits are unavailable until an operator configures this route.'),
 ('avax-c-chain','avax','AVAXC','Avalanche C-Chain',18,true,false,10,false,1,'Deposits are unavailable until an operator configures this route.'),
 ('pol-polygon','pol','POLYGON','Polygon PoS',18,true,false,10,false,128,'Deposits are unavailable until an operator configures this route.'),
 ('dai-erc20','dai','ERC20','Ethereum',18,true,false,10,false,12,'Deposits are unavailable until an operator configures this route.')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crypto_asset_networks" (
  "id", "asset_id", "network_code", "network_name", "decimals", "enabled",
  "customer_deposits_enabled", "display_order", "requires_memo",
  "required_confirmations", "confirmation_guidance", "explorer_url_template",
  "deposit_warning"
)
VALUES
  ('btc-bitcoin', 'btc', 'BTC', 'Bitcoin', 8, true, false, 10, false, 1, 'Wait for at least 1 Bitcoin network confirmation.', 'https://mempool.space/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('eth-ethereum', 'eth', 'ERC20', 'Ethereum', 18, true, false, 10, false, 12, 'Wait for at least 12 Ethereum network confirmations.', 'https://etherscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-erc20', 'usdt', 'ERC20', 'Ethereum', 6, true, false, 10, false, 12, 'Wait for at least 12 Ethereum network confirmations.', 'https://etherscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-trc20', 'usdt', 'TRC20', 'Tron', 6, true, false, 20, false, 19, 'Wait for at least 19 Tron network confirmations.', 'https://tronscan.org/#/transaction/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-bep20', 'usdt', 'BEP20', 'BNB Smart Chain', 6, true, false, 30, false, 15, 'Wait for at least 15 BNB Smart Chain confirmations.', 'https://bscscan.com/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-solana', 'usdt', 'SPL', 'Solana', 6, true, false, 40, false, 32, 'Wait for finalized Solana confirmation.', 'https://solscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-polygon', 'usdt', 'POLYGON', 'Polygon PoS', 6, true, false, 50, false, 128, 'Wait for at least 128 Polygon confirmations.', 'https://polygonscan.com/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-arbitrum', 'usdt', 'ARBITRUM', 'Arbitrum One', 6, true, false, 60, false, 1, 'Wait for the Arbitrum transaction to be confirmed.', 'https://arbiscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-base', 'usdt', 'BASE', 'Base', 6, true, false, 70, false, 1, 'Wait for the Base transaction to be confirmed.', 'https://basescan.org/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdt-avalanche-c', 'usdt', 'AVAXC', 'Avalanche C-Chain', 6, true, false, 80, false, 1, 'Wait for the Avalanche C-Chain transaction to be confirmed.', 'https://snowtrace.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdc-erc20', 'usdc', 'ERC20', 'Ethereum', 6, true, false, 10, false, 12, 'Wait for at least 12 Ethereum network confirmations.', 'https://etherscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdc-solana', 'usdc', 'SPL', 'Solana', 6, true, false, 20, false, 32, 'Wait for finalized Solana confirmation.', 'https://solscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdc-polygon', 'usdc', 'POLYGON', 'Polygon PoS', 6, true, false, 30, false, 128, 'Wait for at least 128 Polygon confirmations.', 'https://polygonscan.com/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdc-arbitrum', 'usdc', 'ARBITRUM', 'Arbitrum One', 6, true, false, 40, false, 1, 'Wait for the Arbitrum transaction to be confirmed.', 'https://arbiscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('usdc-base', 'usdc', 'BASE', 'Base', 6, true, false, 50, false, 1, 'Wait for the Base transaction to be confirmed.', 'https://basescan.org/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('bnb-bep20', 'bnb', 'BEP20', 'BNB Smart Chain', 18, true, false, 10, false, 15, 'Wait for at least 15 BNB Smart Chain confirmations.', 'https://bscscan.com/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('sol-solana', 'sol', 'SOL', 'Solana', 9, true, false, 10, false, 32, 'Wait for finalized Solana confirmation.', 'https://solscan.io/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('xrp-xrpl', 'xrp', 'XRPL', 'XRP Ledger', 6, true, false, 10, true, 1, 'Wait for the XRP Ledger transaction to be validated.', 'https://livenet.xrpl.org/transactions/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('xlm-stellar', 'xlm', 'XLM', 'Stellar', 7, true, false, 10, true, 1, 'Wait for the Stellar transaction to be confirmed.', 'https://stellar.expert/explorer/public/tx/{txid}', 'Deposits are unavailable until an operator configures this route.'),
  ('ton-ton', 'ton', 'TON', 'The Open Network', 9, true, false, 10, true, 1, 'Wait for the TON transaction to be confirmed.', 'https://tonviewer.com/transaction/{txid}', 'Deposits are unavailable until an operator configures this route.')
ON CONFLICT ("id") DO NOTHING;