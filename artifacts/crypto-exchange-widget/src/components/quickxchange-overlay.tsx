import type { ReactNode } from 'react';

type QuickXchangeOverlayHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  closeControl: ReactNode;
};

export function QuickXchangeOverlayHeader({
  title,
  subtitle,
  closeControl,
}: QuickXchangeOverlayHeaderProps) {
  return (
    <div className="qx-overlay-header">
      <div className="qx-overlay-title-group">
        <div className="qx-overlay-title">{title}</div>
        {subtitle ? <div className="qx-overlay-subtitle">{subtitle}</div> : null}
      </div>
      {closeControl}
    </div>
  );
}