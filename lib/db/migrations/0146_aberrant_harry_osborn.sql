CREATE TABLE "rates_xml_published_quotes" (
	"key" text PRIMARY KEY NOT NULL,
	"configuration_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rates_xml_published_quotes_configuration_idx" ON "rates_xml_published_quotes" USING btree ("configuration_hash");