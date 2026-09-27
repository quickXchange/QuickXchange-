import { Link2 } from 'lucide-react';
import {
  SiCoinmarketcap, SiDiscord, SiFacebook, SiGithub, SiInstagram, SiMedium,
  SiReddit, SiTelegram, SiTiktok, SiTrustpilot, SiWhatsapp, SiX, SiYoutube,
} from 'react-icons/si';
import { FaLinkedinIn } from 'react-icons/fa6';

type Identity = { name: string; href: string };

export function socialBrandKind(item: Identity) {
  const name = item.name.toLowerCase();
  const identity = `${name} ${item.href.toLowerCase()}`;
  if (identity.includes('instagram')) return 'instagram';
  if (identity.includes('facebook') || identity.includes('fb.com')) return 'facebook';
  if (identity.includes('coinmarketcap')) return 'coinmarketcap';
  if (identity.includes('medium')) return 'medium';
  if (name === 'x' || identity.includes('x.com') || identity.includes('twitter')) return 'x';
  if (identity.includes('linkedin')) return 'linkedin';
  if (identity.includes('youtube') || identity.includes('youtu.be')) return 'youtube';
  if (identity.includes('tiktok')) return 'tiktok';
  if (identity.includes('telegram') || identity.includes('t.me')) return 'telegram';
  if (identity.includes('whatsapp') || identity.includes('wa.me')) return 'whatsapp';
  if (identity.includes('discord')) return 'discord';
  if (identity.includes('reddit')) return 'reddit';
  if (identity.includes('github')) return 'github';
  if (identity.includes('trustpilot')) return 'trustpilot';
  return 'other';
}

export function SocialBrandMark({ item }: { item: Identity }) {
  switch (socialBrandKind(item)) {
    case 'instagram': return <SiInstagram style={{ color: '#fff' }} aria-hidden="true" />;
    case 'facebook': return <SiFacebook style={{ color: '#1877f2' }} aria-hidden="true" />;
    case 'coinmarketcap': return <SiCoinmarketcap style={{ color: '#3861d0' }} aria-hidden="true" />;
    case 'medium': return <SiMedium style={{ color: '#141414' }} aria-hidden="true" />;
    case 'x': return <SiX style={{ color: '#141414' }} aria-hidden="true" />;
    case 'linkedin': return <FaLinkedinIn style={{ color: '#0a66c2' }} aria-hidden="true" />;
    case 'youtube': return <SiYoutube style={{ color: '#ff0033' }} aria-hidden="true" />;
    case 'tiktok': return <SiTiktok style={{ color: '#111827' }} aria-hidden="true" />;
    case 'telegram': return <SiTelegram style={{ color: '#26a5e4' }} aria-hidden="true" />;
    case 'whatsapp': return <SiWhatsapp style={{ color: '#25d366' }} aria-hidden="true" />;
    case 'discord': return <SiDiscord style={{ color: '#5865f2' }} aria-hidden="true" />;
    case 'reddit': return <SiReddit style={{ color: '#ff4500' }} aria-hidden="true" />;
    case 'github': return <SiGithub style={{ color: '#24292f' }} aria-hidden="true" />;
    case 'trustpilot': return <SiTrustpilot style={{ color: '#00b67a' }} aria-hidden="true" />;
    default: return <Link2 style={{ color: '#5076ba' }} aria-hidden="true" />;
  }
}