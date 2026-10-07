import { Router } from 'express';
import { db, languageSettingsTable } from '@workspace/db';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { defaultLanguageSettings, englishDictionary, flattenDictionary, isSupportedLocale, loadDictionary, mergeDictionary } from '@workspace/i18n/runtime';
import { SUPPORTED_LOCALES, type Locale } from '@workspace/i18n/types';
import { ApiError } from '../lib/api-error';

const router = Router();
const codeSchema = z.enum(SUPPORTED_LOCALES);
const revisionSchema = z.string().regex(/^(0|[1-9]\d{0,9})$/);
const settingsInput = z.object({
  enabledLanguages: z.array(codeSchema).min(1).max(7),
  fallbackLanguage: codeSchema,
  expectedRevision: revisionSchema,
}).strict().refine(value => new Set(value.enabledLanguages).size === value.enabledLanguages.length
  && value.enabledLanguages.includes(value.fallbackLanguage), 'Fallback must be enabled and languages unique');
const dictionaryInput = z.object({
  translations: z.record(z.string(), z.string().trim().min(1).max(20_000)),
  expectedRevision: revisionSchema,
}).strict();
const sourceTranslations = flattenDictionary(englishDictionary);
async function settingsRow() {
  const [row] = await db.select().from(languageSettingsTable).where(eq(languageSettingsTable.id, 'global')).limit(1);
  return row ?? { id: 'global', ...defaultLanguageSettings, version: 0, overrides: {} as Record<string, Record<string, string>> };
}
function publicSettings(row: Awaited<ReturnType<typeof settingsRow>>) {
  return { enabledLanguages: row.enabledLanguages, fallbackLanguage: row.fallbackLanguage, revision: String(row.version) };
}
async function dictionary(code: Locale, row: Awaited<ReturnType<typeof settingsRow>>) {
  const effective = mergeDictionary(await loadDictionary(code), row.overrides[code] ?? {});
  const translations = flattenDictionary(effective);
  return { locale: code, revision: String(row.version), translations, sourceTranslations,
    missingKeys: Object.keys(sourceTranslations).filter(key => !translations[key]?.trim()) };
}
router.use(['/languages', '/admin/languages'], (_req, res, next) => { res.setHeader('cache-control', 'no-store'); next(); });
router.get('/languages', async (_req, res) => res.json(publicSettings(await settingsRow())));
router.get('/admin/languages', async (_req, res) => res.json(publicSettings(await settingsRow())));
router.get('/languages/dictionaries/:locale', async (req, res) => {
  const code = codeSchema.parse(req.params.locale);
  const row = await settingsRow();
  if (!row.enabledLanguages.includes(code)) throw new ApiError('LANGUAGE_DISABLED', 'This language is not available', 404);
  const result = await dictionary(code, row);
  res.json({ ...result, sourceTranslations: {} });
});
router.get('/admin/languages/dictionaries/:locale', async (req, res) =>
  res.json(await dictionary(codeSchema.parse(req.params.locale), await settingsRow())));

async function updateSettings(expectedRevision: string, change: Partial<typeof languageSettingsTable.$inferInsert>) {
  return db.transaction(async tx => {
    await tx.insert(languageSettingsTable).values({
      id: 'global', enabledLanguages: [...SUPPORTED_LOCALES], fallbackLanguage: 'en', overrides: {}, version: 0,
    }).onConflictDoNothing();
    const [updated] = await tx.update(languageSettingsTable).set({ ...change, version: sql`${languageSettingsTable.version} + 1` })
      .where(and(eq(languageSettingsTable.id, 'global'), eq(languageSettingsTable.version, Number(expectedRevision)))).returning();
    if (!updated) throw new ApiError('LANGUAGE_SETTINGS_CHANGED', 'Language settings changed; reload before saving', 409);
    return updated;
  });
}
router.put('/admin/languages', async (req, res) => {
  const input = settingsInput.parse(req.body);
  const updated = await updateSettings(input.expectedRevision, { enabledLanguages: input.enabledLanguages, fallbackLanguage: input.fallbackLanguage });
  res.json(publicSettings(updated));
});
router.put('/admin/languages/dictionaries/:locale', async (req, res) => {
  const code = codeSchema.parse(req.params.locale);
  const input = dictionaryInput.parse(req.body);
  if (Object.keys(input.translations).length > 5_000) throw new ApiError('INVALID_TRANSLATIONS', 'Too many translation changes');
  for (const [key, value] of Object.entries(input.translations)) {
    if (!Object.hasOwn(sourceTranslations, key)) throw new ApiError('UNKNOWN_TRANSLATION', 'Unknown translation key');
    const placeholders = (text: string) => (text.match(/\{\{?\s*[\w.-]+\s*\}?\}/g) ?? []).sort().join('|');
    if (placeholders(value) !== placeholders(sourceTranslations[key]!)) throw new ApiError('INVALID_TRANSLATION', 'Translation placeholders must match the source');
  }
  const current = await settingsRow();
  const updated = await updateSettings(input.expectedRevision, {
    overrides: { ...current.overrides, [code]: { ...current.overrides[code], ...input.translations } },
  });
  res.json(await dictionary(code, updated));
});
export default router;
