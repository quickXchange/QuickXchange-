import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';
import { useOptionalI18n } from '@/i18n/provider';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const i18n = useOptionalI18n();

  return (
    <Loader2Icon
      role="status"
      aria-label={i18n?.t('genericUi.loading') ?? 'Loading'}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
