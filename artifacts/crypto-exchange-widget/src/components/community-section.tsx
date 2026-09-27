import type { SocialTrustConfig } from '@workspace/api-client-react';
import { useAppTheme } from '@/theme';
import { useSitePreview } from '@/components/site-preview-context';
import { FooterSocialIcon, orderedPublishedSocialItems } from '@/components/public-shell';
import './community-section.css';

export function CommunitySection({ socialTrust }: { socialTrust?: Pick<SocialTrustConfig, 'items'> | null }) {
  const preview = useSitePreview();
  const isDark = useAppTheme();
  const items = orderedPublishedSocialItems(socialTrust);

  if (!items.length) return null;

  return (
    <section className="qx-community" aria-labelledby="qx-community-title" data-testid="section-home-community">
      <div className="qx-community-inner">
        <div className="qx-community-copy">
          <span className="qx-community-eyebrow">Official channels</span>
          <h2 id="qx-community-title" className="qx-community-title">Follow QuickXChange</h2>
          <p className="qx-community-description">Join our community. Find us where you already are.</p>
        </div>
        <nav className="qx-community-links" aria-label="QuickXChange official community channels">
          {items.map(item => (
            <a
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Follow QuickXChange on ${item.name}`}
              title={item.name}
              className="qx-community-link"
              data-testid={`link-home-community-${item.id}`}
            >
              <span className="qx-community-mark" aria-hidden="true">
                <FooterSocialIcon item={item} preview={preview} isDark={isDark} preferUploadedTrustpilot />
              </span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}