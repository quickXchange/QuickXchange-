CREATE TABLE IF NOT EXISTS "blockchain_monitor_networks" (
  "id" text PRIMARY KEY NOT NULL,
  "network_code" text NOT NULL,
  "network_name" text NOT NULL,
  "adapter_kind" text NOT NULL,
  "chain_id" text,
  "provider_kind" text DEFAULT 'none' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "endpoint_secret_ref" text,
  "api_key_secret_ref" text,
  "confirmations_required" integer DEFAULT 0 NOT NULL,
  "finality_policy" text DEFAULT 'confirmations' NOT NULL,
  "poll_interval_seconds" integer DEFAULT 15 NOT NULL,
  "cursor" text,
  "last_head" text,
  "health_status" text DEFAULT 'not_configured' NOT NULL,
  "health_checked_at" timestamp with time zone,
  "health_error" text,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "lease_token" text,
  "lease_expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blockchain_monitor_networks_provider_kind_check" CHECK ("blockchain_monitor_networks"."provider_kind" in ('rpc','indexer','none')),
  CONSTRAINT "blockchain_monitor_networks_health_status_check" CHECK ("blockchain_monitor_networks"."health_status" in ('connected','disconnected','not_configured')),
  CONSTRAINT "blockchain_monitor_networks_confirmations_check" CHECK ("blockchain_monitor_networks"."confirmations_required" >= 0),
  CONSTRAINT "blockchain_monitor_networks_poll_interval_check" CHECK ("blockchain_monitor_networks"."poll_interval_seconds" between 5 and 86400)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_networks_code_uidx" ON "blockchain_monitor_networks" USING btree ("network_code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blockchain_monitor_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "monitor_network_id" text NOT NULL REFERENCES "blockchain_monitor_networks"("id") ON DELETE cascade,
  "asset_network_id" text NOT NULL REFERENCES "crypto_asset_networks"("id") ON DELETE restrict,
  "identity_kind" text DEFAULT 'native' NOT NULL,
  "contract_or_mint" text,
  "decimals" integer NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blockchain_monitor_assets_identity_kind_check" CHECK ("blockchain_monitor_assets"."identity_kind" in ('native','token')),
  CONSTRAINT "blockchain_monitor_assets_decimals_check" CHECK ("blockchain_monitor_assets"."decimals" between 0 and 36),
  CONSTRAINT "blockchain_monitor_assets_token_identity_check" CHECK ("blockchain_monitor_assets"."identity_kind" = 'native' or nullif(btrim("blockchain_monitor_assets"."contract_or_mint"), '') is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_assets_route_uidx" ON "blockchain_monitor_assets" USING btree ("monitor_network_id","asset_network_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_assets_identity_uidx" ON "blockchain_monitor_assets" USING btree ("monitor_network_id","identity_kind","contract_or_mint");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blockchain_monitor_watches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" text NOT NULL REFERENCES "exchange_orders"("id") ON DELETE restrict,
  "monitor_network_id" text NOT NULL REFERENCES "blockchain_monitor_networks"("id") ON DELETE restrict,
  "monitor_asset_id" uuid NOT NULL REFERENCES "blockchain_monitor_assets"("id") ON DELETE restrict,
  "asset_network_id" text NOT NULL REFERENCES "crypto_asset_networks"("id") ON DELETE restrict,
  "expected_amount" numeric NOT NULL,
  "receiving_address" text NOT NULL,
  "memo_or_tag" text,
  "identity_kind" text NOT NULL,
  "contract_or_mint" text,
  "decimals" integer NOT NULL,
  "order_created_at" timestamp with time zone NOT NULL,
  "start_cursor" text,
  "current_cursor" text,
  "registration_state" text DEFAULT 'active' NOT NULL,
  "registration_reason" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blockchain_monitor_watches_amount_check" CHECK ("blockchain_monitor_watches"."expected_amount" > 0),
  CONSTRAINT "blockchain_monitor_watches_decimals_check" CHECK ("blockchain_monitor_watches"."decimals" between 0 and 36)
  ,CONSTRAINT "blockchain_monitor_watches_registration_state_check" CHECK ("blockchain_monitor_watches"."registration_state" in ('active','pending_review'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_watches_order_uidx" ON "blockchain_monitor_watches" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blockchain_monitor_watches_address_idx" ON "blockchain_monitor_watches" USING btree ("monitor_network_id","receiving_address","active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blockchain_monitor_registration_gaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" text NOT NULL REFERENCES "exchange_orders"("id") ON DELETE cascade,
  "network_code" text NOT NULL,
  "asset_code" text NOT NULL,
  "receiving_address" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
  ,"resolved_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_registration_gaps_order_uidx" ON "blockchain_monitor_registration_gaps" ("order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blockchain_monitor_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "monitor_network_id" text NOT NULL REFERENCES "blockchain_monitor_networks"("id") ON DELETE restrict,
  "monitor_asset_id" uuid NOT NULL REFERENCES "blockchain_monitor_assets"("id") ON DELETE restrict,
  "transaction_hash" text NOT NULL,
  "event_index" text DEFAULT '0' NOT NULL,
  "from_address" text,
  "to_address" text NOT NULL,
  "amount" numeric NOT NULL,
  "block_reference" text,
  "block_hash" text,
  "confirmations" integer DEFAULT 0 NOT NULL,
  "finalized" boolean DEFAULT false NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "block_timestamp" timestamp with time zone,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "payload_digest" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blockchain_monitor_observations_amount_check" CHECK ("blockchain_monitor_observations"."amount" > 0),
  CONSTRAINT "blockchain_monitor_observations_confirmations_check" CHECK ("blockchain_monitor_observations"."confirmations" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_observations_identity_uidx" ON "blockchain_monitor_observations" USING btree ("monitor_network_id","transaction_hash","event_index","monitor_asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blockchain_monitor_observations_address_idx" ON "blockchain_monitor_observations" USING btree ("monitor_network_id","to_address","observed_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blockchain_monitor_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "watch_id" uuid NOT NULL REFERENCES "blockchain_monitor_watches"("id") ON DELETE restrict,
  "observation_id" uuid NOT NULL REFERENCES "blockchain_monitor_observations"("id") ON DELETE restrict,
  "order_id" text NOT NULL REFERENCES "exchange_orders"("id") ON DELETE restrict,
  "state" text DEFAULT 'confirming' NOT NULL,
  "match_basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ambiguity_reason" text,
  "confirmations" integer DEFAULT 0 NOT NULL,
  "confirmations_required" integer DEFAULT 0 NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blockchain_monitor_matches_state_check" CHECK ("blockchain_monitor_matches"."state" in ('confirming','matched','needs_review','applied','rejected')),
  CONSTRAINT "blockchain_monitor_matches_confirmations_check" CHECK ("blockchain_monitor_matches"."confirmations" >= 0),
  CONSTRAINT "blockchain_monitor_matches_confirmations_required_check" CHECK ("blockchain_monitor_matches"."confirmations_required" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_matches_observation_watch_uidx" ON "blockchain_monitor_matches" USING btree ("observation_id","watch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blockchain_monitor_matches_applied_order_uidx" ON "blockchain_monitor_matches" USING btree ("order_id") WHERE "state" = 'applied';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blockchain_monitor_matches_state_created_idx" ON "blockchain_monitor_matches" USING btree ("state","created_at");