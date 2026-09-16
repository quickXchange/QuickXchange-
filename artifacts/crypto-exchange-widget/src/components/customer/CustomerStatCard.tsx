import type { ReactNode } from 'react';
import { cn } from '@/components/shared-app-ui';

export function CustomerStatCard({
  title,
  value,
  description,
  icon,
  className,
  valueTestId,
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  className?: string;
  valueTestId?: string;
}) {
  return (
    <div className={cn("customer-card dashboard-stat-card min-w-0 flex flex-col justify-between", className)}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="dashboard-stat-title text-muted-foreground">{title}</h3>
        {icon && (
          <div className="dashboard-stat-icon flex shrink-0 items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="dashboard-stat-value min-w-0 text-foreground" data-testid={valueTestId}>
          {value}
        </div>
        {description && <div className="dashboard-stat-description truncate text-muted-foreground">{description}</div>}
      </div>
    </div>
  );
}
