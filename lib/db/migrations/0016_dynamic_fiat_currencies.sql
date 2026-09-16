CREATE TABLE IF NOT EXISTS "fiat_currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"network" text NOT NULL,
	"precision" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fiat_currencies_code_uidx" ON "fiat_currencies" USING btree ("code");--> statement-breakpoint
INSERT INTO "fiat_currencies" ("id", "code", "name", "network", "precision", "enabled")
VALUES
	('00000000-0000-4000-8000-000000000001', 'USD', 'US Dollar', 'Bank transfer', 2, true),
	('00000000-0000-4000-8000-000000000002', 'EUR', 'Euro', 'SEPA', 2, true),
	('00000000-0000-4000-8000-000000000003', 'GBP', 'British Pound', 'Bank transfer', 2, true),
	('00000000-0000-4000-8000-000000000004', 'AED', 'UAE Dirham', 'Bank transfer', 2, true)
ON CONFLICT ("code") DO NOTHING;