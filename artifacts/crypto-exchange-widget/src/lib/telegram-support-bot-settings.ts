import type {
  SupportBotSettingsInput,
  TelegramSupportBotCategory,
  TelegramSupportBotFaq,
  TelegramSupportBotStatus,
} from '@workspace/api-client-react';

export type Locale = 'en' | 'fr' | 'ar' | 'es' | 'de' | 'ru' | 'uk' | 'ko';
export const LOCALES: { code: Locale; name: string }[] = [
  { code: 'en', name: 'English' }, { code: 'fr', name: 'Francais' }, { code: 'ar', name: 'Arabic' },
  { code: 'es', name: 'Espanol' }, { code: 'de', name: 'Deutsch' }, { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' }, { code: 'ko', name: 'Korean' },
];


export function newId(prefix: string, seed: string) {
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug ? `${slug}-` : `${prefix}-`}${rand}`;
}

export function cleanSettings(s: SupportBotSettingsInput): SupportBotSettingsInput {
  const welcome: SupportBotSettingsInput['welcomeMessages'] = {};
  for (const { code } of LOCALES) {
    const v = (s.welcomeMessages[code] ?? '').trim();
    if (v) welcome[code] = v;
  }
  return {
    ...s,
    supportUrl: s.supportUrl?.trim() ? s.supportUrl.trim() : null,
    welcomeMessages: welcome,
    categories: s.categories.map((c) => {
      const label: TelegramSupportBotCategory['label'] = {};
      for (const { code } of LOCALES) { const v = (c.label[code] ?? '').trim(); if (v) label[code] = v; }
      return { ...c, label };
    }),
    faqs: s.faqs.map((f) => {
      const translations: TelegramSupportBotFaq['translations'] = {};
      for (const { code } of LOCALES) {
        const t = f.translations[code];
        if (!t) continue;
        const question = t.question.trim(); const answer = t.answer.trim();
        const aliases = t.aliases.map((a) => a.trim()).filter(Boolean);
        if (question || answer || aliases.length) translations[code] = { question, answer, aliases };
      }
      return { ...f, translations };
    }),
  };
}

export function validate(s: SupportBotSettingsInput, status?: TelegramSupportBotStatus): string[] {
  const errors: string[] = [];
  if (!(s.welcomeMessages.en ?? '').trim()) errors.push('English welcome message is required.');
  if (s.supportUrl?.trim() && !/^(https:\/\/(t\.me|telegram\.me)\/[A-Za-z][A-Za-z0-9_]{4,31}\/?|@?[A-Za-z][A-Za-z0-9_]{4,31})$/i.test(s.supportUrl.trim())) {
    errors.push('Support account must be a username, @username or https://t.me/username.');
  }
  if (s.enabled && status && !(status.tokenConfigured && status.webhookSecretConfigured)) {
    errors.push('Bot cannot be enabled until both support bot secrets are configured.');
  }
  if (s.enabled && s.contactSupportEnabled && !s.supportUrl?.trim()) errors.push('Contact Support button requires a support account.');
  s.categories.forEach((c, i) => { if (!(c.label.en ?? '').trim()) errors.push(`Category ${i + 1} needs an English label.`); });
  s.faqs.forEach((f, i) => {
    if (!s.categories.some((c) => c.id === f.categoryId)) errors.push(`FAQ ${i + 1} needs a category.`);
    const en = f.translations.en;
    if (!en?.question.trim() || !en.answer.trim()) errors.push(`FAQ ${i + 1} needs an English question and answer.`);
    for (const { code } of LOCALES) {
      const t = f.translations[code];
      if (t && (t.question.trim() || t.answer.trim() || t.aliases.some((a) => a.trim())) && !(t.question.trim() && t.answer.trim())) {
        errors.push(`FAQ ${i + 1} (${code}) needs both question and answer, or leave both blank.`);
      }
    }
  });
  return errors;
}

export function applyFaqEdit(f: TelegramSupportBotFaq, fn: (f: TelegramSupportBotFaq) => TelegramSupportBotFaq, keepApproval = false): TelegramSupportBotFaq {
  const next = fn(f);
  return keepApproval ? next : { ...next, approved: false };
}
