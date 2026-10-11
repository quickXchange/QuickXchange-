ALTER TABLE "fiat_currency_payment_methods" ALTER COLUMN "reserve" SET DEFAULT '1000000';--> statement-breakpoint
ALTER TABLE "bestchange_settings" ADD COLUMN "xml_method_settings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bestchange_settings" ADD COLUMN "rates_xml_published" boolean DEFAULT false NOT NULL;