import { useI18n as useCustomerI18n } from "@workspace/i18n";
export default function NotFound() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center space-y-4">
      <h1 className="text-4xl font-bold text-primary">404</h1>
      <p className="text-muted-foreground text-sm">{uiT("customer.ma469ab4ca4e5")}</p>
    </div>
  );
}
