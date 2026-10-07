import { useState } from 'react';
import { measureSocialLogo, type SocialLogoFit } from './social-logo-fit';

export function FooterSocialImage({ src, onError }: { src: string; onError: () => void }) {
  const [measured, setMeasured] = useState<{ src: string; fit: SocialLogoFit | null } | null>(null);
  const fit = measured?.src === src ? measured.fit : null;
  return <img
    src={src}
    alt=""
    className="qx-footer-social-image qx-footer-social-fitted-image"
    loading="lazy"
    style={fit ? {
      width: `${fit.width}%`,
      height: `${fit.height}%`,
      transform: `translate(${fit.translateX}%, ${fit.translateY}%)`,
    } : undefined}
    onLoad={(event) => setMeasured({ src, fit: measureSocialLogo(event.currentTarget, src) })}
    onError={onError}
  />;
}
