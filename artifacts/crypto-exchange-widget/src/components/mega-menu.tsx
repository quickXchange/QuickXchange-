import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/components/shared-app-ui';
import {
  ArrowRight, ArrowRightLeft, ShoppingCart, Banknote, Coins, Star,
  Users, Info, HelpCircle, Handshake, Code2, CreditCard,
  Clock, MessageCircle, Newspaper,
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
    title: 'Personal',
    items: [
      { label: 'Buy Crypto', href: '/buy', icon: ShoppingCart, description: 'Purchase with fiat easily', disabled: true },
      { label: 'Sell Crypto', href: '/sell', icon: Banknote, description: 'Cash out to your bank', disabled: true },
      { label: 'Coins', href: '/market-rates', icon: Coins, description: 'Explore live crypto markets' },
      { label: 'Pairs', href: '/crypto-pairs', icon: ArrowRightLeft, description: 'Browse supported Convert routes' },
      { label: 'Reviews', href: '/reviews', icon: Star, description: 'Customer experiences', disabled: true },
    ]
  },
  {
    title: 'Business',
    items: [
      { label: 'Affiliate Program', href: '/affiliates', icon: Users, description: 'Earn by referring others' },
      { label: 'Crypto Exchange API', href: '/crypto-exchange-api', icon: Code2, description: 'Connect exchange services to your product', disabled: true },
      { label: 'Payment Gateway', href: '/payment-gateway', icon: CreditCard, description: 'Accept digital asset payments', disabled: true },
    ]
  },
  {
    title: 'Company',
    items: [
      { label: 'About Us', href: '/about', icon: Info, description: 'Our mission and team' },
      { label: 'How It Works', href: '/how-it-works', icon: HelpCircle, description: 'Platform mechanics' },
      { label: 'Our Partners', href: '/partners', icon: Handshake, description: 'Our trusted network', disabled: true },
    ]
  },
  {
    title: 'Support',
    items: [
      { label: 'FAQ', href: '/faq', icon: MessageCircle, description: 'Common questions answered' },
      { label: 'Track an Order', href: '/status', icon: Clock, description: 'Track your exchange' },
      { label: 'Contact Support', href: '/contact', icon: HelpCircle, description: '24/7 customer service' },
    ]
  },
  {
    title: 'Blog',
    items: [
      { label: 'Blog', href: '/blog', icon: Newspaper, description: 'News, guides, and insights' },
    ],
    direct: true,
  }
];

export function DesktopMegaMenu({ groups = NAVIGATION_DATA }: { groups?: NavGroup[] }) {
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
    <nav ref={navRef} className="qx-mega-nav hidden xl:flex" aria-label="Main Navigation">
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
                {group.title}
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
              {group.title}
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
            {group.title}
            <ChevronDown size={14} className={cn("transition-transform duration-200", openGroup === group.title && "rotate-180")} />
          </button>
          
          <div 
            id={`mega-panel-${group.title.toLowerCase()}`}
            className="qx-mega-panel"
            role="region"
            aria-label={`${group.title} submenu`}
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
                      {item.label}
                      {item.disabled && <span className="qx-badge-soon">Soon</span>}
                    </span>
                    <span className="qx-mega-item-desc">{item.description}</span>
                  </div>
                  <ArrowRight size={18} className="qx-mega-item-arrow" />
                </>
              );

              const itemIsActive = !item.disabled && isCurrentRoute(item.href);
              const className = cn("qx-mega-item", item.disabled && "is-disabled", itemIsActive && "active");

              if (item.disabled) {
                return (
                  <div key={item.label} className={className} aria-disabled="true">
                    {content}
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
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      )})}
    </nav>
  );
}
