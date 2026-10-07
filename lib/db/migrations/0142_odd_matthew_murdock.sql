CREATE TABLE "language_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"enabled_languages" jsonb NOT NULL,
	"fallback_language" text NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "language_settings_singleton" CHECK ("language_settings"."id" = 'global')
);
