import { sourceText } from "@workspace/i18n/runtime";
import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/components/shared-app-ui';
import {
  ArrowRight, ArrowRightLeft, Coins, Info, HelpCircle, ShieldCheck,
  BookOpen, Clock, MessageCircle, Newspaper,
  ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  disabled?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
  direct?: boolean;
  disabled?: boolean;
};

export const NAVIGATION_DATA: NavGroup[] = [
  {
    title: sourceText("customer.m8d6cc7850782"),
    items: [
      { label: sourceText("customer.mba48de1cf13f"), href: '/market-rates', icon: Coins, description: sourceText("customer.m85421b60df52") },
      { label: sourceText("customer.mc432569d80a9"), href: '/crypto-pairs', icon: ArrowRightLeft, description: sourceText("customer.mf4450e6f7cdc") },
      { label: sourceText("customer.m7c961a3c5ebe"), href: '/about', icon: Info, description: sourceText("customer.m0b33a086ce51") },
      { label: sourceText("customer.m631378ac5941"), href: '/how-it-works', icon: HelpCircle, description: sourceText("customer.m32b05dec9b98") },
    ]
  },
  {
    title: sourceText("customer.m62421bff7b47"),
    items: [
      { label: 'FAQ', href: '/faq', icon: MessageCircle, description: sourceText("customer.m0cfe27ae1c80") },
      { label: sourceText("customer.me8a37f362786"), href: '/status', icon: Clock, description: sourceText("customer.m9b4a707c4099") },
      { label: sourceText("customer.mb0d75ac23304"), href: '/aml-kyc', icon: ShieldCheck, description: sourceText("customer.mbc712005e8e9") },
      { label: sourceText("customer.mfe340c99f287"), href: '/contact', icon: HelpCircle, description: sourceText("customer.mb53f17bf4e3c") },
    ]
  },
  {
    title: sourceText("customer.m468c2c5657c2"),
    items: [
      { label: sourceText("customer.m468c2c5657c2"), href: '/user-manual', icon: BookOpen, description: sourceText("customer.md3519daa6a35") },
    ],
    direct: true,
  },
  {
    title: sourceText("customer.m0bd7a95c35c4"),
    items: [
      { label: sourceText("customer.m0bd7a95c35c4"), href: '/blog', icon: Newspaper, description: sourceText("customer.m7eb5fc4c30cc") },
    ],
    direct: true,
  }
];

export function DesktopMegaMenu({ groups = NAVIGATION_DATA }: { groups?: NavGroup[] }) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [location] = useLocation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroup(null);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    
    if (openGroup) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(timeoutRef.current);
    };
  }, [openGroup]);

  const handleMouseEnter = (title: string) => {
    clearTimeout(timeoutRef.current);
    setOpenGroup(title);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setOpenGroup(null);
    }, 150);
  };

  const isCurrentRoute = (href: string) => location === href || (href !== '/' && location.startsWith(`${href}/`));

  return (
    <nav ref={navRef} className="qx-mega-nav hidden xl:flex" aria-label={uiT("customer.m56ea852a517b")}>
      {groups.map((group) => {
        if (group.direct) {
          const item = group.items[0];
          const disabled = group.disabled || !item || item.disabled;
          const active = Boolean(item && !disabled && isCurrentRoute(item.href));
          if (disabled) {
            return (
              <span
                key={group.title}
                className="qx-mega-direct is-disabled"
                aria-disabled="true"
              >
                {uiText(group.title)}
              </span>
            );
          }
          return (
            <Link
              key={group.title}
              href={item.href}
              className={cn('qx-mega-direct', active && 'active')}
              aria-current={active ? 'page' : undefined}
              data-testid={`link-mega-${group.title.toLowerCase()}`}
            >
              {uiText(group.title)}
            </Link>
          );
        }
        const groupIsActive = group.items.some((item) => !item.disabled && isCurrentRoute(item.href));
        const groupIsOpen = openGroup === group.title;
        return (
        <div 
          key={group.title} 
          className={cn('qx-mega-group', groupIsActive && 'active', groupIsOpen && 'is-open')}
          onMouseEnter={() => handleMouseEnter(group.title)}
          onMouseLeave={handleMouseLeave}
        >
          <button
            type="button"
            className={cn('qx-mega-trigger', groupIsActive && 'active')}
            aria-haspopup="true"
            aria-expanded={groupIsOpen}
            aria-controls={`mega-panel-${group.title.toLowerCase()}`}
            onClick={() => setOpenGroup(openGroup === group.title ? null : group.title)}
            data-testid={`button-mega-${group.title.toLowerCase()}`}
          >
            {uiText(group.title)}
            <ChevronDown size={14} className={cn("transition-transform duration-200", openGroup === group.title && "rotate-180")} />
          </button>
          
          <div 
            id={`mega-panel-${group.title.toLowerCase()}`}
            className="qx-mega-panel"
            role="region"
            aria-label={uiT("customer.m8adf99d3ff39", { v0: group.title })}
            aria-hidden={!groupIsOpen}
            inert={!groupIsOpen}
          >
            {group.items.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  <div className="qx-mega-item-icon">
                    <Icon size={20} />
                  </div>
                  <div className="qx-mega-item-content">
                    <span className="qx-mega-item-title">
                      {uiText(item.label)}
                      {item.disabled && <span className="qx-badge-soon">{uiT("customer.mcf0ee3547a4e")}</span>}
                    </span>
                    <span className="qx-mega-item-desc">{uiText(item.description)}</span>
                  </div>
                  <ArrowRight size={18} className="qx-mega-item-arrow" />
                </>
              );

              const itemIsActive = !item.disabled && isCurrentRoute(item.href);
              const className = cn("qx-mega-item", item.disabled && "is-disabled", itemIsActive && "active");

              if (item.disabled) {
                return (
                  <div key={item.label} className={className} aria-disabled="true">
                    {uiText(content)}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={className}
                  aria-current={itemIsActive ? 'page' : undefined}
                  onClick={() => setOpenGroup(null)}
                >
                  {uiText(content)}
                </Link>
              );
            })}
          </div>
        </div>
      )})}
    </nav>
  );
}
