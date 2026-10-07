import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
export const languageSettingsTable = pgTable('language_settings', {
  id: text('id').primaryKey().default('global'),
  enabledLanguages: jsonb('enabled_languages').$type<string[]>().notNull(),
  fallbackLanguage: text('fallback_language').notNull(),
  overrides: jsonb('overrides').$type<Record<string, Record<string, string>>>().notNull().default({}),
  version: integer('version').notNull().default(0),
}, table => [check('language_settings_singleton', sql`${table.id} = 'global'`)]);
export const insertLanguageSettingsSchema = createInsertSchema(languageSettingsTable).omit({ id: true });
