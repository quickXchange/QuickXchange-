import { useI18n as useCustomerI18n } from "@workspace/i18n";
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
  const { t: uiT, tx: uiText } = useCustomerI18n();

  return (
    <div className="qx-overlay-header">
      <div className="qx-overlay-title-group">
        <div className="qx-overlay-title">{uiText(title)}</div>
        {subtitle ? <div className="qx-overlay-subtitle">{uiText(subtitle)}</div> : null}
      </div>
      {uiText(closeControl)}
    </div>
  );
}