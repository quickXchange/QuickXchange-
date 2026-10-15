CREATE TABLE "manual_wallet_registrations" (
	"asset_network_id" text PRIMARY KEY NOT NULL,
	"target_id" uuid,
	"monitor_asset_id" uuid,
	"address" text NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_wallet_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_network_id" text NOT NULL,
	"address" text NOT NULL,
	"canonical_address" text NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_wallet_registrations" ADD CONSTRAINT "manual_wallet_registrations_asset_network_id_crypto_asset_networks_id_fk" FOREIGN KEY ("asset_network_id") REFERENCES "public"."crypto_asset_networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_wallet_registrations" ADD CONSTRAINT "manual_wallet_registrations_target_id_manual_wallet_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."manual_wallet_targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_wallet_registrations" ADD CONSTRAINT "manual_wallet_registrations_monitor_asset_id_blockchain_monitor_assets_id_fk" FOREIGN KEY ("monitor_asset_id") REFERENCES "public"."blockchain_monitor_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_wallet_targets" ADD CONSTRAINT "manual_wallet_targets_monitor_network_id_blockchain_monitor_networks_id_fk" FOREIGN KEY ("monitor_network_id") REFERENCES "public"."blockchain_monitor_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_wallet_targets_identity_uidx" ON "manual_wallet_targets" USING btree ("monitor_network_id","canonical_address","memo");