import type { ReactNode, RefObject } from 'react';

type AdminHeaderProps = {
  headerRef: RefObject<HTMLElement | null>;
  brand: ReactNode;
  children: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  titleIcon?: ReactNode;
  subtitle?: ReactNode;
  menu: ReactNode;
  action?: ReactNode;
  controls: ReactNode;
};

export function AdminHeader({
  headerRef,
  brand,
  children,
  eyebrow,
  title,
  titleIcon,
  subtitle,
  menu,
  action,
  controls,
}: AdminHeaderProps) {
  return (
    <>
      <header className="admin-header qx-global-admin-header" ref={headerRef}>
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <div className="qx-mobile-nav-wrap">{menu}</div>
            <div className="admin-header-brand" data-testid="admin-header-brand">{brand}</div>
          </div>

          <div className="admin-header-heading qx-header-content-group">
            <div className="admin-header-breadcrumb qx-breadcrumb" data-testid="admin-header-section-label">
              {eyebrow}
            </div>
            <div className="admin-header-title-group qx-header-title-group">
              {titleIcon && (
                <div className="admin-header-title-icon qx-header-title-icon">
                  {titleIcon}
                </div>
              )}
              <h1 data-testid="admin-header-title">{title}</h1>
            </div>
            {subtitle && (
              <p className="admin-header-subtitle qx-header-subtitle">{subtitle}</p>
            )}
          </div>

          <div className="admin-header-right">
            {action}
            {controls}
          </div>
        </div>
      </header>

      <main className="admin-main">
        {children}
      </main>
    </>
  );
}