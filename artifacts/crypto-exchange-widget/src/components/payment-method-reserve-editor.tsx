import { useGetFiatCurrencies, useGetFiatCurrencyPaymentMethods } from "@workspace/api-client-react";
import type { PaymentMethodReserveInput } from "@workspace/api-client-react";

export function PaymentMethodReserveEditor({
  methodId, value, onChange, disabled,
}: {
  methodId?: string;
  value: PaymentMethodReserveInput[];
  onChange: (value: PaymentMethodReserveInput[]) => void;
  disabled: boolean;
}) {
  const currencies = useGetFiatCurrencies();
  const attachments = useGetFiatCurrencyPaymentMethods();
  const attached = (attachments.data ?? []).filter(row => row.paymentMethodId === methodId);
  const ids = [...new Set([...attached.map(row => row.fiatCurrencyId), ...value.map(row => row.fiatCurrencyId)])];
  const available = (currencies.data ?? []).filter(currency => !ids.includes(currency.id));
  const setReserve = (fiatCurrencyId: string, reserve: string) => {
    onChange([...value.filter(row => row.fiatCurrencyId !== fiatCurrencyId), { fiatCurrencyId, reserve }]);
  };
  return (
    <section className="space-y-3" aria-label="Payment Method reserves" data-testid="pm-reserves">
      <div>
        <span className="field-label">Reserve by currency</span>
        <p className="field-hint">Manually maintained payout capacity. BestChange reads the receiving method’s current reserve. Orders do not change it.</p>
      </div>
      {(currencies.isError || attachments.isError) && <p role="alert" className="field-hint">Could not load reserve currencies. Reopen this editor to try again.</p>}
      {(currencies.isLoading || attachments.isLoading) && <p className="field-hint">Loading reserves…</p>}
      {ids.map(id => {
        const currency = currencies.data?.find(row => row.id === id);
        if (!currency) return null;
        const reserve = value.find(row => row.fiatCurrencyId === id)?.reserve
          ?? attached.find(row => row.fiatCurrencyId === id)?.reserve ?? "0";
        const pattern = currency.precision > 0 ? `[0-9]{1,20}(\\.[0-9]{1,${currency.precision}})?` : "[0-9]{1,20}";
        return <label key={id}>
          <span className="field-label">Reserve <small>{currency.code}</small></span>
          <input type="text" inputMode="decimal" required pattern={pattern}
            title={`Nonnegative ${currency.code} amount, up to ${currency.precision} decimal places`}
            value={reserve} onChange={event => setReserve(id, event.target.value)}
            disabled={disabled} data-testid={`input-pm-reserve-${currency.code}`} />
          <span className="field-hint">{currency.name} · {currency.code}. Zero prevents BestChange advertising this receiving route.</span>
        </label>;
      })}
      {available.length > 0 && <label>
        <span className="field-label">Add currency reserve</span>
        <select value="" disabled={disabled || attachments.isLoading} data-testid="select-pm-reserve-currency"
          onChange={event => { if (event.target.value) setReserve(event.target.value, "0"); }}>
          <option value="">Select currency…</option>
          {available.map(currency => <option key={currency.id} value={currency.id}>{currency.code} — {currency.name}</option>)}
        </select>
        <span className="field-hint">Adding a currency creates the method’s currency attachment when you save.</span>
      </label>}
    </section>
  );
}