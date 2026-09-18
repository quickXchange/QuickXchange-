import { useEffect, useState } from 'react';
import { SiTelegram } from 'react-icons/si';
import { SUPPORT_TELEGRAM } from '@/components/shared-app-ui';

export function TelegramSupportButton() {
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('[data-public-footer]');
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href={SUPPORT_TELEGRAM}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Telegram Support"
      title="Telegram Support"
      data-testid="telegram-support-button"
      className={[
        'group fixed right-[max(1rem,env(safe-area-inset-right))] z-40',
        'bottom-[max(1rem,calc(env(safe-area-inset-bottom)+1rem))]',
        'grid size-12 place-items-center rounded-full',
        'bg-[#229ED9] text-white ring-1 ring-white/25',
        'shadow-[0_8px_24px_rgba(34,158,217,0.34),0_0_20px_rgba(91,92,246,0.24)]',
        'transition-[transform,opacity,box-shadow] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:scale-105',
        'hover:shadow-[0_10px_28px_rgba(34,158,217,0.46),0_0_26px_rgba(124,58,237,0.32)]',
        'active:translate-y-0 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none motion-reduce:transition-none',
        footerVisible ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <SiTelegram aria-hidden="true" className="size-[1.35rem] -translate-x-px" />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-[calc(100%+0.625rem)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
      >
        Telegram Support
      </span>
    </a>
  );
}