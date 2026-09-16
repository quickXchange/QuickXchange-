CREATE TABLE IF NOT EXISTS "provider_integrations" (
	"provider" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"encryption_version" integer DEFAULT 1 NOT NULL,
	"created_by_operator_id" text,
	"updated_by_operator_id" text,
	"last_tested_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
