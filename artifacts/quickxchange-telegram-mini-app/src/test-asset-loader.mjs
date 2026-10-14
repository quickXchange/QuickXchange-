// Node's test runner has no Vite asset pipeline. The tests inspect URLs, not image bytes.
export async function load(url, context, nextLoad) {
  // Logo SSR tests run without client language bootstrap. Use the real English
  // dictionary for labels, not the loading-only client Provider. Browser tests
  // and the shared i18n suite independently exercise that real Provider.
  if (url.endsWith('/lib/i18n/src/index.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        export * from './runtime.ts';
        import { englishDictionary, translate } from './runtime.ts';
        export function useI18n() {
          return {
            t: (key, params) => translate(englishDictionary, key, params),
            tx: value => value,
          };
        }
      `,
    };
  }
  if (/\.(png|webp)(?:\?|$)/.test(url)) {
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
  }
  return nextLoad(url, context);
}