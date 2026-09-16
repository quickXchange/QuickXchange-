CREATE TABLE IF NOT EXISTS "exchange_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"volume" numeric DEFAULT '0' NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "exchange_customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exchange_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"from_asset" text NOT NULL,
	"from_network" text DEFAULT '' NOT NULL,
	"to_asset" text NOT NULL,
	"to_network" text DEFAULT '' NOT NULL,
	"amount" numeric NOT NULL,
	"receive_amount" numeric NOT NULL,
	"customer_email" text NOT NULL,
	"customer_name" text DEFAULT 'Guest' NOT NULL,
	"destination_address" text DEFAULT '' NOT NULL,
	"destination_memo" text DEFAULT '' NOT NULL,
	"refund_address" text DEFAULT '' NOT NULL,
	"refund_memo" text DEFAULT '' NOT NULL,
	"deposit_address" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"payout_method" text DEFAULT '' NOT NULL,
	"provider" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"provider_reference" text DEFAULT '' NOT NULL,
	"provider_order_id" text DEFAULT '' NOT NULL,
	"provider_state" text DEFAULT '' NOT NULL,
	"quote_id" text DEFAULT '' NOT NULL,
	"client_request_id" text,
	"error_code" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"outcome_unknown" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_orders_client_request_id_unique" UNIQUE("client_request_id")
);
--> statement-breakpoint
ALTER TABLE "exchange_orders"
	ADD COLUMN IF NOT EXISTS "from_network" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "to_network" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "destination_memo" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "refund_memo" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "provider_state" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "quote_id" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "client_request_id" text,
	ADD COLUMN IF NOT EXISTS "error_code" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "error_message" text DEFAULT '' NOT NULL,
	ADD COLUMN IF NOT EXISTS "outcome_unknown" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exchange_orders_client_request_id_unique"
	ON "exchange_orders" ("client_request_id");
