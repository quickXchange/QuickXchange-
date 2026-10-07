import { useI18n as useCustomerI18n } from "@workspace/i18n";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const { toasts } = useToast();

  return (
    <ToastProvider>
      {uiText(toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{uiText(title)}</ToastTitle>}
              {description && (
                <ToastDescription>{uiText(description)}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      }))}
      <ToastViewport />
    </ToastProvider>
  );
}
