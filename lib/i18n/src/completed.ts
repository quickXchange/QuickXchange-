import type { Locale } from './types';
const loaders = {
  fr: () => import('./completed/fr'),
  de: () => import('./completed/de'),
  ru: () => import('./completed/ru'),
  es: () => import('./completed/es'),
  ko: () => import('./completed/ko'),
  uk: () => import('./completed/uk'),
};
export async function loadCompletedTranslations(locale: Exclude<Locale, 'en'>) {
  return (await loaders[locale]()).default;
}
