const PAYMENT_METHOD_BRANDFETCH_DOMAINS: Readonly<Record<string, string>> = {
  w0: "wio.io",
  "perfect-money": "perfectmoney.com",
  "sepa-instant": "europeanpaymentscouncil.eu",
  paysera: "paysera.com",
  kzt: "kaspi.kz",
  "revolut-eur": "revolut.com",
  n26: "n26.com",
  wise: "wise.com",
};

export function paymentMethodBrandfetchLogoUrl(paymentMethodId: string): string | undefined {
  const domain = PAYMENT_METHOD_BRANDFETCH_DOMAINS[paymentMethodId];
  return domain
    ? `https://cdn.brandfetch.io/${domain}/w/400/h/400/symbol`
    : undefined;
}