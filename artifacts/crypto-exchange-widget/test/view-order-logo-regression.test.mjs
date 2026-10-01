import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('known crypto identities retain official fallbacks after a supplied URL fails', async () => {
  const identity = await source('../src/components/crypto-identity.tsx');
  const avatar = await source('../src/components/logo-avatar.tsx');
  const resolver = identity.match(/export function resolveCryptoLogoSources[\s\S]*?\n}\n/)?.[0];

  assert.ok(resolver, 'shared crypto source resolver should remain available');
  assert.ok(resolver.indexOf('logoUrl,') < resolver.indexOf('entry?.logoUrl'));
  assert.ok(resolver.indexOf('entry?.logoUrl') < resolver.indexOf('OFFICIAL_CRYPTO_LOGOS.get(resolvedSymbol)'));
  assert.match(avatar, /onError=\{\(\) => \{\s*setIntrinsicAspect\(null\);\s*setSourceIndex\(effectiveSourceIndex \+ 1\);/);
  assert.match(identity, /OFFICIAL_CRYPTO_LOGOS\.get\(normalizedSymbol\)\?\.logoUrl/);
  assert.match(identity, /fallback=\{normalizedSymbol\.slice\(0, 1\) \|\| '¤'\}/);
});

test('customer order detail and tracking identities use current catalog branding and fit rules', async () => {
  const orderIdentity = await source('../src/components/order-settlement-identity.tsx');
  const paymentLogo = await source('../src/components/payment-method-logo.tsx');

  assert.match(orderIdentity, /const methodName = paymentMethodName\(paymentOption\)/);
  assert.match(orderIdentity, /name=\{methodName\}\s+logoUrl=\{paymentOption\.logoUrl\}/);
  assert.match(orderIdentity, /logoUrl=\{paymentOption\.logoUrl\}/);
  assert.doesNotMatch(orderIdentity, /preferTransparentBbvaArtwork|summaryLogoArtwork/);
  assert.match(paymentLogo, /brand === 'bbva' \? \[isDark \? bbvaWhiteLogoUrl : bbvaTransparentLogoUrl\] : \[logoUrl\]/);
  assert.equal((orderIdentity.match(/logoFit="contain"/g) || []).length, 2);
  assert.match(orderIdentity, /networkLogoUrl=\{paymentOption \?[\s\S]*?logoFit="contain"/);
});

test('Admin View Order prefers canonical Admin branding and retains snapshots as fallback', async () => {
  const admin = await source('../src/pages/admin.tsx');

  assert.match(admin, /const sideSnapshot = recordOf\(snapshot\[sending \? 'source' : 'target'\]\)/);
  assert.match(admin, /option\?\.logoUrl \|\| snapshotLogoUrl/);
  assert.match(admin, /AdminCryptoLogo symbol=\{asset\} logoUrl=\{option\?\.logoUrl \|\| snapshotLogoUrl\} size="md" fit="contain"/);
  assert.match(admin, /AdminCryptoLogo symbol=\{asset\} logoUrl=\{option\?\.logoUrl\} size="sm" fit="contain"/);
});

test('shared and drawer logo rendering stays circular, centered, contain-fit, and size-consistent', async () => {
  const shared = await source('../src/flag-icon.css');
  const siteStyles = await source('../src/index.css');
  const paymentStyles = await source('../../../lib/payment-logo/src/styles.css');
  const adminStyles = await source('../src/admin-redesign.css');

  assert.match(shared, /\.logo-avatar\s*\{[^}]*place-items:\s*center[^}]*overflow:\s*hidden[^}]*border-radius:\s*50%/s);
  assert.match(shared, /\.logo-avatar-fit-contain\s*>\s*\.logo-avatar-img\s*\{[^}]*object-fit:\s*contain[^}]*\}/s);
  assert.match(siteStyles, /@import '@workspace\/payment-logo\/styles\.css'/);
  assert.match(shared, /\.payment-method-logo-stack\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(paymentStyles, /\.payment-logo-frame\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(paymentStyles, /\.payment-logo-frame > \.payment-logo-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.doesNotMatch(shared, /\.payment-method-logo-stack\s*>\s*\.payment-method-logo\.logo-avatar/);
  assert.match(shared, /\.crypto-network-badge\s*>\s*\.network-logo-badge\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/s);
  assert.match(adminStyles, /\.quickx-view-order \.quickx-exchange-card :is\(\.admin-crypto-logo, \.admin-payment-logo-stack\)\s*\{[^}]*width:\s*40px[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(adminStyles, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.quickx-view-order \.quickx-exchange-card[\s\S]*?width:\s*36px/s);
});

test('website payment methods render through the shared measured logo in both themes', async () => {
  const component = await source('../src/components/payment-method-logo.tsx');
  const packageJson = JSON.parse(await source('../package.json'));

  assert.equal(packageJson.devDependencies['@workspace/payment-logo'], 'workspace:*');
  assert.match(component, /import \{ PaymentLogo \} from '@workspace\/payment-logo'/);
  assert.match(component, /<PaymentLogo[\s\S]*?size="100%"/);
  assert.match(component, /isDark \? bbvaWhiteLogoUrl : bbvaTransparentLogoUrl/);
  assert.match(component, /brand === 'bbva' \? \[isDark \? bbvaWhiteLogoUrl : bbvaTransparentLogoUrl\] : \[logoUrl\]/);
  assert.match(component, /<FiatCurrencyFlag code=\{badgeCode\} flagUrl=\{flagUrl\} variant=\{badgeVariant\} size="sm" \/>/);
  assert.doesNotMatch(component, /PAYMENT_METHOD_VISUAL_PROFILES|logoScale|<LogoAvatar|className="payment-method-logo"/);
  assert.ok(component.indexOf(': [logoUrl]') < component.indexOf('preferBrandIcon ? [brandfetchUrl, bundledFallback]'));
});

test('landing payment ticker uses un-clipped contain boxes and measured theme contrast', async () => {
  const app = await source('../src/App.tsx');
  const component = await source('../src/components/payment-method-logo.tsx');
  const styles = await source('../src/index.css');
  const paymentLogo = await source('../../../lib/payment-logo/src/index.ts');

  assert.match(app, /<PaymentMethodLogo\s+name=\{method\.name\}\s+logoUrl=\{method\.logoUrl\}[\s\S]*?className="payment-ticker-logo"/);
  assert.match(component, /const themeLogoUrl = isDark \? darkLogoUrl : lightLogoUrl/);
  assert.match(component, /const logoUrl = themeLogoUrl \|\| configuredLogoUrl/);
  assert.match(styles, /\.payment-method-logo-stack\.payment-ticker-logo\s*\{\s*overflow:\s*visible !important;\s*border-radius:\s*0 !important;/);
  assert.match(styles, /\.payment-method-logo-stack\.payment-ticker-logo \.payment-logo-frame\s*\{[^}]*border-radius:\s*0 !important[^}]*overflow:\s*visible !important/s);
  assert.match(styles, /\.payment-method-logo-stack\.payment-ticker-logo \.payment-logo-image\s*\{[^}]*object-fit:\s*contain !important[^}]*object-position:\s*center !important[^}]*transform:\s*none !important/s);
  assert.match(styles, /\.dark \.payment-method-logo-stack\.payment-ticker-logo \.payment-logo-frame-low-luminance\s*\{[^}]*background:\s*#f5f6f8 !important/s);
  assert.match(styles, /\.dark \.payment-method-logo-stack\.payment-ticker-logo\[data-brand="visa"\] \.payment-logo-fallback\s*\{\s*background:\s*#f5f6f8;/);
  assert.match(styles, /html:not\(\.dark\).*payment-ticker-logo.*payment-logo-frame-high-luminance/s);
  assert.match(paymentLogo, /fit\.transparentBackground && \(fit\.artworkLuminance \?\? 0\) >= 0\.82/);
});
