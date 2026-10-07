import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  return (
    <Loader2Icon
      role="status"
      aria-label={uiT("customer.mdc380888c4e2")}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
