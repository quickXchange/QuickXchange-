import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Link } from 'wouter';
import { basePath, cn } from '@/components/shared-app-ui';
import { BrandLogo } from '@/components/brand-logo';

type SideDrawerProps = {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  id: string;
  ariaLabel: string;
  closeLabel: string;
  layerTestId: string;
  drawerTestId: string;
  backdropTestId: string;
  closeTestId: string;
  children: ReactNode;
};

export function SideDrawer({
  open,
  onClose,
  triggerRef,
  id,
  ariaLabel,
  closeLabel,
  layerTestId,
  drawerTestId,
  backdropTestId,
  closeTestId,
  children,
}: SideDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
      }
      return;
    }

    wasOpenRef.current = true;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const previousRootOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const containFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', containFocus);
    window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('a, button:not(:disabled)')
        ?.focus();
    });
    return () => {
      document.removeEventListener('keydown', containFocus);
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [open, triggerRef]);

  return createPortal(
    <div
      className={cn('frontend-menu-drawer-layer', open && 'is-open')}
      aria-hidden={!open}
      inert={!open}
      data-testid={layerTestId}
    >
      <button
        type="button"
        className="frontend-menu-drawer-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
        data-testid={backdropTestId}
      />
      <aside
        ref={panelRef}
        id={id}
        className="frontend-menu-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid={drawerTestId}
      >
        <div className="side-drawer-screen">
          <div className="frontend-drawer-header">
            <BrandLogo
              onNavigate={onClose}
              className="frontend-drawer-brand"
              testId="link-frontend-drawer-brand"
            />
            <button
              type="button"
              className="frontend-drawer-close"
              onClick={onClose}
              aria-label={closeLabel}
              data-testid={closeTestId}
            >
              <X size={24} />
            </button>
          </div>
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}