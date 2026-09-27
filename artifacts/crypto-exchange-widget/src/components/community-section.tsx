import type { CSSProperties } from 'react';
import type { SocialIconAppearance, SocialTrustConfig, SocialTrustItem } from '@workspace/api-client-react';
import { useAppTheme } from '@/theme';
import { useSitePreview } from '@/components/site-preview-context';
import { FooterSocialIcon, orderedPublishedSocialItems } from '@/components/public-shell';
import { SocialBrandMark, socialBrandKind } from '@/components/social-brand-mark';
import './community-section.css';

type CommunityAppearance = SocialIconAppearance & { depthIntensity?: number };
type CommunityConfig = Pick<SocialTrustConfig, 'items'> & { appearance?: CommunityAppearance | null };

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function markClass(item: Pick<SocialTrustItem, 'name' | 'href'>, uploaded: boolean) {
  if (uploaded) return '';
  const kind = socialBrandKind(item);
  if (kind === 'instagram') return 'qx-community-instagram';
  if (['medium', 'x', 'tiktok', 'github'].includes(kind)) return 'qx-community-inset';
  return '';
}

export function CommunitySection({ socialTrust }: { socialTrust?: CommunityConfig | null }) {
  const preview = useSitePreview();
  const isDark = useAppTheme();
  const items = orderedPublishedSocialItems(socialTrust);
  if (!items.length) return null;

  const appearance = socialTrust?.appearance;
  const circleSize = bounded(appearance?.circleSize, 52, 36, 80);
  const iconSize = bounded(appearance?.iconSize, 25, 16, 48);
  const spacing = bounded(appearance?.spacing, 14, 4, 36);
  const glow = bounded(appearance?.glowIntensity, 35, 0, 100) / 100;
  const depth = bounded(appearance?.depthIntensity, 45, 0, 100) / 100;
  const hover = ['none', 'lift', 'scale', 'glow'].includes(appearance?.hoverAnimation ?? '')
    ? appearance?.hoverAnimation : 'lift';
  const style = {
    '--community-circle-size': `${circleSize}px`,
    '--community-icon-size': `${Math.min(iconSize, circleSize - 10)}px`,
    '--community-spacing': `${spacing}px`,
    '--community-glow': glow,
    '--community-depth': depth,
  } as CSSProperties;

  return (
    <section className="qx-community" aria-labelledby="qx-community-title" data-testid="section-home-community" style={style}>
      <div className="qx-community-inner">
        <div className="qx-community-copy">
          <span className="qx-community-eyebrow">Official channels</span>
          <h2 id="qx-community-title" className="qx-community-title">Follow QuickXChange</h2>
          <p className="qx-community-description">Join our community. Find us where you already are.</p>
        </div>
        <nav className="qx-community-links" aria-label="QuickXChange official community channels">
          {items.map(item => {
            const uploaded = Boolean(item.appearance === 'separate'
              ? (isDark ? item.darkObjectPath || item.objectPath : item.lightObjectPath || item.objectPath)
              : item.objectPath);
            return <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Follow QuickXChange on ${item.name}`}
              title={item.name}
              className="qx-community-link"
              data-hover={hover}
              data-testid={`link-home-community-${item.id}`}
            >
              <span className={`qx-community-mark ${markClass(item, uploaded)}`} aria-hidden="true">
                {uploaded
                  ? <FooterSocialIcon item={item} preview={preview} isDark={isDark} preferUploadedTrustpilot />
                  : <SocialBrandMark item={item} />}
              </span>
            </a>;
          })}
        </nav>
      </div>
    </section>
  );
}