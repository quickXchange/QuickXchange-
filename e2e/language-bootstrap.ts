import type { Page } from '@playwright/test';

/** Network fixtures only: both apps still render their real shared dictionaries. */
export async function mockLanguageBootstrap(page: Page) {
  await page.route('**/api/languages', route => route.fulfill({
    json: { enabledLanguages: ['en', 'fr', 'de', 'ru', 'es', 'ko', 'uk'], fallbackLanguage: 'en', revision: 'e2e' },
  }));
  await page.route('**/api/languages/dictionaries/*', route => route.fulfill({
    json: { translations: {} },
  }));
}
