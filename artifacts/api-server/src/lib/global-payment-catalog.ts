import type { PaymentMethodFieldDefinition } from "@workspace/db";

/**
 * Static, provider-neutral reference data for operator configuration. Nothing in
 * this file implies that a rail is API-integrated or enabled for customers.
 * Slugs are deliberately stable so seeds can use upserts/conflict-do-nothing.
 */
export type CatalogLifecycle = "active" | "restricted" | "deprecated";
export type PaymentMethodFamily =
  | "bank-transfer"
  | "card"
  | "digital-wallet"
  | "mobile-money"
  | "cash"
  | "ecommerce"
  | "voucher"
  | "other";
export type ExecutionMode = "catalog" | "manual" | "api";
export type CatalogDirection = "send" | "receive" | "both";

export type FiatCurrencyCatalogItem = Readonly<{
  code: string;
  name: string;
  precision: number;
  lifecycle: CatalogLifecycle;
}>;

export type PaymentMethodCatalogItem = Readonly<{
  /** Stable `payment_methods.id` candidate. */
  id: string;
  name: string;
  family: PaymentMethodFamily;
  executionMode: ExecutionMode;
  lifecycle: CatalogLifecycle;
  direction: CatalogDirection;
  compatibleCurrencyCodes: readonly string[];
  regions?: readonly string[];
  countries?: readonly string[];
  fields: readonly PaymentMethodFieldDefinition[];
  description: string;
}>;

export type FiatPaymentMethodAttachment = Readonly<{
  /** Stable compound key for an idempotent attachment seed. */
  id: string;
  paymentMethodId: string;
  currencyCode: string;
  direction: CatalogDirection;
  lifecycle: CatalogLifecycle;
}>;

export type CryptoAssetCatalogItem = Readonly<{
  id: string;
  code: string;
  name: string;
  decimals: number;
  lifecycle: CatalogLifecycle;
}>;

export type CryptoNetworkCatalogItem = Readonly<{
  id: string;
  assetId: string;
  networkCode: string;
  networkName: string;
  decimals: number;
  requiresMemo: boolean;
  lifecycle: CatalogLifecycle;
  /** Operational policy belongs in configuration, not this catalog. */
  defaultRequiredConfirmations: number;
}>;

const recipientName = {
  key: "recipient_name",
  type: "account-name",
  label: "Recipient name",
  direction: "receive",
  required: true,
  min: 2,
  max: 140,
} as const satisfies PaymentMethodFieldDefinition;
const accountHolder = {
  key: "account_holder_name",
  type: "account-name",
  label: "Account holder name",
  direction: "receive",
  required: true,
  min: 2,
  max: 140,
} as const satisfies PaymentMethodFieldDefinition;
const iban = {
  key: "iban",
  type: "account-iban",
  label: "IBAN",
  direction: "receive",
  required: true,
  help: "Enter the recipient's IBAN; spaces are accepted.",
} as const satisfies PaymentMethodFieldDefinition;
const bankAccount = {
  key: "bank_account_number",
  type: "account-number",
  label: "Bank account number",
  direction: "receive",
  required: true,
  min: 4,
  max: 34,
} as const satisfies PaymentMethodFieldDefinition;
const bic = {
  key: "bic",
  type: "bank-code",
  label: "BIC / SWIFT code",
  direction: "receive",
  required: true,
  pattern: "^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$",
  help: "8 or 11 character bank identifier.",
} as const satisfies PaymentMethodFieldDefinition;
const routingNumber = {
  key: "routing_number",
  type: "routing-number",
  label: "Routing number",
  direction: "receive",
  required: true,
  min: 4,
  max: 12,
} as const satisfies PaymentMethodFieldDefinition;
const bankCode = {
  key: "bank_code",
  type: "bank-code",
  label: "Bank or branch code",
  direction: "receive",
  required: true,
  min: 2,
  max: 20,
} as const satisfies PaymentMethodFieldDefinition;
const walletEmail = {
  key: "wallet_email",
  type: "email",
  label: "Wallet account email",
  direction: "receive",
  required: true,
} as const satisfies PaymentMethodFieldDefinition;
const phone = {
  key: "recipient_phone",
  type: "phone",
  label: "Recipient mobile number",
  direction: "receive",
  required: true,
  help: "Use international format where supported.",
} as const satisfies PaymentMethodFieldDefinition;

const eurBankCustomerFields = [
  {
    key: "name",
    type: "account-name",
    label: "NAME",
    direction: "receive",
    required: true,
    min: 2,
    max: 140,
  },
  iban,
  {
    key: "tag",
    type: "memo-tag",
    label: "TAG",
    direction: "receive",
    required: false,
    max: 100,
  },
  {
    key: "payment_description",
    type: "long-text",
    label: "Description of payment",
    direction: "receive",
    required: true,
    min: 2,
    max: 500,
  },
  {
    key: "telegram_or_whatsapp",
    type: "short-text",
    label: "Your Telegram or WhatsApp",
    direction: "receive",
    required: true,
    min: 2,
    max: 100,
  },
] as const satisfies readonly PaymentMethodFieldDefinition[];

/** Broad active ISO 4217 operating-currency baseline (codes are unique). */
export const FIAT_CURRENCY_CATALOG = [
  ["AED", "UAE Dirham", 2], ["AFN", "Afghani", 2], ["ALL", "Albanian Lek", 2],
  ["AMD", "Armenian Dram", 2], ["ANG", "Netherlands Antillean Guilder", 2], ["AOA", "Kwanza", 2],
  ["ARS", "Argentine Peso", 2], ["AUD", "Australian Dollar", 2], ["AWG", "Aruban Florin", 2],
  ["AZN", "Azerbaijan Manat", 2], ["BAM", "Convertible Mark", 2], ["BBD", "Barbados Dollar", 2],
  ["BDT", "Taka", 2], ["BGN", "Bulgarian Lev", 2], ["BHD", "Bahraini Dinar", 3],
  ["BIF", "Burundi Franc", 0], ["BMD", "Bermudian Dollar", 2], ["BND", "Brunei Dollar", 2],
  ["BOB", "Boliviano", 2], ["BOV", "Mvdol", 2], ["BRL", "Brazilian Real", 2],
  ["BSD", "Bahamian Dollar", 2], ["BTN", "Ngultrum", 2], ["BWP", "Pula", 2],
  ["BYN", "Belarusian Ruble", 2], ["BZD", "Belize Dollar", 2], ["CAD", "Canadian Dollar", 2],
  ["CDF", "Congolese Franc", 2], ["CHE", "WIR Euro", 2], ["CHF", "Swiss Franc", 2],
  ["CHW", "WIR Franc", 2], ["CLP", "Chilean Peso", 0], ["CNY", "Yuan Renminbi", 2],
  ["COP", "Colombian Peso", 2], ["COU", "Unidad de Valor Real", 2], ["CRC", "Costa Rican Colon", 2],
  ["CUP", "Cuban Peso", 2], ["CVE", "Cabo Verde Escudo", 2], ["CZK", "Czech Koruna", 2],
  ["DJF", "Djibouti Franc", 0], ["DKK", "Danish Krone", 2], ["DOP", "Dominican Peso", 2],
  ["DZD", "Algerian Dinar", 2], ["EGP", "Egyptian Pound", 2], ["ERN", "Nakfa", 2],
  ["ETB", "Ethiopian Birr", 2], ["EUR", "Euro", 2], ["FJD", "Fiji Dollar", 2],
  ["FKP", "Falkland Islands Pound", 2], ["GBP", "Pound Sterling", 2], ["GEL", "Lari", 2],
  ["GHS", "Ghana Cedi", 2], ["GIP", "Gibraltar Pound", 2], ["GMD", "Dalasi", 2],
  ["GNF", "Guinean Franc", 0], ["GTQ", "Quetzal", 2], ["GYD", "Guyana Dollar", 2],
  ["HKD", "Hong Kong Dollar", 2], ["HNL", "Lempira", 2], ["HRK", "Croatian Kuna", 2],
  ["HTG", "Gourde", 2], ["HUF", "Forint", 2], ["IDR", "Rupiah", 2],
  ["ILS", "New Israeli Sheqel", 2], ["INR", "Indian Rupee", 2], ["IQD", "Iraqi Dinar", 3],
  ["IRR", "Iranian Rial", 2], ["ISK", "Iceland Krona", 0], ["JMD", "Jamaican Dollar", 2],
  ["JOD", "Jordanian Dinar", 3], ["JPY", "Yen", 0], ["KES", "Kenyan Shilling", 2],
  ["KGS", "Som", 2], ["KHR", "Riel", 2], ["KMF", "Comorian Franc", 0],
  ["KPW", "North Korean Won", 2], ["KRW", "Won", 0], ["KWD", "Kuwaiti Dinar", 3],
  ["KYD", "Cayman Islands Dollar", 2], ["KZT", "Tenge", 2], ["LAK", "Lao Kip", 2],
  ["LBP", "Lebanese Pound", 2], ["LKR", "Sri Lanka Rupee", 2], ["LRD", "Liberian Dollar", 2],
  ["LSL", "Loti", 2], ["LYD", "Libyan Dinar", 3], ["MAD", "Moroccan Dirham", 2],
  ["MDL", "Moldovan Leu", 2], ["MGA", "Malagasy Ariary", 2], ["MKD", "Denar", 2],
  ["MMK", "Kyat", 2], ["MNT", "Tugrik", 2], ["MOP", "Pataca", 2], ["MRU", "Ouguiya", 2],
  ["MUR", "Mauritius Rupee", 2], ["MVR", "Rufiyaa", 2], ["MWK", "Malawi Kwacha", 2],
  ["MXN", "Mexican Peso", 2], ["MXV", "Mexican Unidad de Inversion", 2], ["MYR", "Malaysian Ringgit", 2],
  ["MZN", "Mozambique Metical", 2], ["NAD", "Namibia Dollar", 2], ["NGN", "Naira", 2],
  ["NIO", "Cordoba Oro", 2], ["NOK", "Norwegian Krone", 2], ["NPR", "Nepalese Rupee", 2],
  ["NZD", "New Zealand Dollar", 2], ["OMR", "Rial Omani", 3], ["PAB", "Balboa", 2],
  ["PEN", "Sol", 2], ["PGK", "Kina", 2], ["PHP", "Philippine Peso", 2],
  ["PKR", "Pakistan Rupee", 2], ["PLN", "Zloty", 2], ["PYG", "Guarani", 0],
  ["QAR", "Qatari Rial", 2], ["RON", "Romanian Leu", 2], ["RSD", "Serbian Dinar", 2],
  ["RUB", "Russian Ruble", 2], ["RWF", "Rwanda Franc", 0], ["SAR", "Saudi Riyal", 2],
  ["SBD", "Solomon Islands Dollar", 2], ["SCR", "Seychelles Rupee", 2], ["SDG", "Sudanese Pound", 2],
  ["SEK", "Swedish Krona", 2], ["SGD", "Singapore Dollar", 2], ["SHP", "Saint Helena Pound", 2],
  ["SLE", "Leone", 2], ["SOS", "Somali Shilling", 2], ["SRD", "Surinam Dollar", 2],
  ["SSP", "South Sudanese Pound", 2], ["STN", "Dobra", 2], ["SVC", "El Salvador Colon", 2],
  ["SYP", "Syrian Pound", 2], ["SZL", "Lilangeni", 2], ["THB", "Baht", 2],
  ["TJS", "Somoni", 2], ["TMT", "Turkmenistan New Manat", 2], ["TND", "Tunisian Dinar", 3],
  ["TOP", "Pa’anga", 2], ["TRY", "Turkish Lira", 2], ["TTD", "Trinidad and Tobago Dollar", 2],
  ["TWD", "New Taiwan Dollar", 2], ["TZS", "Tanzanian Shilling", 2], ["UAH", "Hryvnia", 2],
  ["UGX", "Uganda Shilling", 0], ["USD", "US Dollar", 2], ["USN", "US Dollar (Next day)", 2],
  ["UYI", "Uruguay Peso en Unidades Indexadas", 0], ["UYU", "Uruguayan Peso", 2],
  ["UYW", "Unidad Previsional", 4], ["UZS", "Uzbekistan Sum", 2], ["VED", "Bolivar Soberano", 2],
  ["VES", "Bolivar Soberano", 2], ["VND", "Dong", 0], ["VUV", "Vatu", 0],
  ["WST", "Tala", 2], ["XAF", "CFA Franc BEAC", 0], ["XCD", "East Caribbean Dollar", 2],
  ["XOF", "CFA Franc BCEAO", 0], ["XPF", "CFP Franc", 0], ["YER", "Yemeni Rial", 2],
  ["ZAR", "Rand", 2], ["ZMW", "Zambian Kwacha", 2], ["ZWL", "Zimbabwe Dollar", 2],
].map(([code, name, precision]) => ({
  code: code as string,
  name: name as string,
  precision: precision as number,
  lifecycle: "active" as const,
})) satisfies readonly FiatCurrencyCatalogItem[];

const SWIFT_CURRENCIES = FIAT_CURRENCY_CATALOG.map(({ code }) => code);
const SEPA_CURRENCIES = ["EUR"] as const;

export const PAYMENT_METHOD_CATALOG = [
  { id: "swift-bank-transfer", name: "SWIFT bank transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: SWIFT_CURRENCIES, regions: ["Global"], fields: [accountHolder, bankAccount, bic], description: "International bank settlement requiring operator review." },
  { id: "sepa-transfer", name: "SEPA transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: SEPA_CURRENCIES, regions: ["EEA", "SEPA"], fields: [accountHolder, iban], description: "EUR transfer within the SEPA area." },
  { id: "sepa-instant", name: "SEPA Instant", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["SEPA"], fields: [accountHolder, iban], description: "EUR instant transfer where participating banks support it." },
  { id: "paysera", name: "Paysera", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a Paysera account." },
  { id: "bunq", name: "bunq", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a bunq account." },
  { id: "bbva", name: "BBVA", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a BBVA account." },
  { id: "icard", name: "iCard", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to an iCard account." },
  { id: "bnp-paribas", name: "BNP Paribas", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a BNP Paribas account." },
  { id: "ing", name: "ING", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to an ING account." },
  { id: "commerzbank", name: "Commerzbank", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a Commerzbank account." },
  { id: "caixabank", name: "CaixaBank", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "SEPA"], fields: eurBankCustomerFields, description: "Manual EUR settlement to a CaixaBank account." },
  { id: "ach", name: "ACH", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [accountHolder, bankAccount, routingNumber], description: "US domestic ACH transfer." },
  { id: "fedwire", name: "Fedwire", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [accountHolder, bankAccount, routingNumber], description: "US domestic wire transfer." },
  { id: "faster-payments", name: "Faster Payments", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["GBP"], countries: ["GB"], fields: [accountHolder, bankAccount], description: "UK domestic faster payment." },
  { id: "chaps", name: "CHAPS", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["GBP"], countries: ["GB"], fields: [accountHolder, bankAccount], description: "UK high-value bank transfer." },
  { id: "interac", name: "Interac e-Transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["CAD"], countries: ["CA"], fields: [walletEmail, recipientName], description: "Canadian domestic email transfer." },
  { id: "pix", name: "PIX", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["BRL"], countries: ["BR"], fields: [recipientName, phone], description: "Brazilian instant payment; operator verifies the payout key." },
  { id: "spei", name: "SPEI", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["MXN"], countries: ["MX"], fields: [accountHolder, bankAccount, bankCode], description: "Mexican domestic bank transfer." },
  { id: "upi", name: "UPI", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["INR"], countries: ["IN"], fields: [recipientName, phone], description: "Indian instant payment; operator verifies the UPI identifier." },
  { id: "imps-neft-rtgs", name: "IMPS / NEFT / RTGS", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["INR"], countries: ["IN"], fields: [accountHolder, bankAccount, bankCode], description: "Indian domestic bank transfer." },
  { id: "payid-npp", name: "PayID / NPP", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["AUD"], countries: ["AU"], fields: [recipientName, phone], description: "Australian instant payment; operator verifies the PayID." },
  { id: "paynow", name: "PayNow", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["SGD"], countries: ["SG"], fields: [recipientName, phone], description: "Singapore domestic instant payment." },
  { id: "promptpay", name: "PromptPay", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["THB"], countries: ["TH"], fields: [recipientName, phone], description: "Thai domestic instant payment." },
  { id: "local-bank-transfer", name: "Local bank transfer", family: "bank-transfer", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["AED", "TRY", "KZT", "UAH", "NGN", "ZAR"], fields: [accountHolder, bankAccount, bankCode], description: "Operator-managed domestic bank transfer." },
  { id: "revolut-eur", name: "Revolut EUR", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["EUR"], regions: ["EEA", "United Kingdom"], fields: [accountHolder, iban], description: "Manual settlement to a Revolut EUR account." },
  { id: "revolut-usd", name: "Revolut USD", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], regions: ["EEA", "United Kingdom"], fields: [accountHolder, bankAccount, bic], description: "Manual settlement to a Revolut USD account." },
  { id: "paypal", name: "PayPal", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP", "CAD", "AUD"], fields: [walletEmail], description: "Manual e-wallet settlement using an account email." },
  { id: "skrill", name: "Skrill", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP"], fields: [walletEmail], description: "Manual e-wallet settlement using an account email." },
  { id: "perfect-money", name: "Perfect Money", family: "digital-wallet", executionMode: "manual", lifecycle: "restricted", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual wallet settlement subject to compliance review." },
  { id: "payeer", name: "Payeer", family: "digital-wallet", executionMode: "manual", lifecycle: "restricted", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual wallet settlement subject to compliance review." },
  { id: "capitalist", name: "Capitalist", family: "digital-wallet", executionMode: "manual", lifecycle: "restricted", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual wallet settlement subject to compliance review." },
  { id: "volet", name: "Volet", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR"], fields: [walletEmail], description: "Manual e-wallet settlement using the account email." },
  { id: "neteller", name: "Neteller", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP"], fields: [walletEmail], description: "Manual e-wallet settlement using the account email." },
  { id: "wise", name: "Wise", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD", "EUR", "GBP", "AUD", "CAD"], fields: [accountHolder, bankAccount], description: "Manual settlement to a Wise account." },
  { id: "zelle", name: "Zelle", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [walletEmail, phone], description: "US domestic settlement." },
  { id: "cash-app", name: "Cash App", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [phone, recipientName], description: "US manual wallet settlement." },
  { id: "venmo", name: "Venmo", family: "digital-wallet", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["USD"], countries: ["US"], fields: [phone, recipientName], description: "US manual wallet settlement." },
  { id: "visa-kzt", name: "KZT Visa card", family: "card", executionMode: "manual", lifecycle: "active", direction: "receive", compatibleCurrencyCodes: ["KZT"], countries: ["KZ"], fields: [recipientName], description: "Card settlement requires an approved operator flow. Never collect card number, security code, or authentication data." },
  { id: "visa-uah", name: "UAH Visa card", family: "card", executionMode: "manual", lifecycle: "active", direction: "receive", compatibleCurrencyCodes: ["UAH"], countries: ["UA"], fields: [recipientName], description: "Card settlement requires an approved operator flow. Never collect card number, security code, or authentication data." },
  { id: "mpesa-kenya", name: "M-Pesa Kenya", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["KES"], countries: ["KE"], fields: [phone, recipientName], description: "Manual mobile-money settlement in Kenya." },
  { id: "mpesa-tanzania", name: "M-Pesa Tanzania", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["TZS"], countries: ["TZ"], fields: [phone, recipientName], description: "Manual mobile-money settlement in Tanzania." },
  { id: "gcash", name: "GCash", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["PHP"], countries: ["PH"], fields: [phone, recipientName], description: "Manual mobile-wallet settlement in the Philippines." },
  { id: "bkash", name: "bKash", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["BDT"], countries: ["BD"], fields: [phone, recipientName], description: "Manual mobile-money settlement in Bangladesh." },
  { id: "easypaisa", name: "Easypaisa", family: "mobile-money", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["PKR"], countries: ["PK"], fields: [phone, recipientName], description: "Manual mobile-wallet settlement in Pakistan." },
  { id: "alipay", name: "Alipay", family: "ecommerce", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["CNY"], countries: ["CN"], fields: [phone, recipientName], description: "Manual wallet settlement subject to operator and local compliance review." },
  { id: "wechat-pay", name: "WeChat Pay", family: "ecommerce", executionMode: "manual", lifecycle: "active", direction: "both", compatibleCurrencyCodes: ["CNY"], countries: ["CN"], fields: [phone, recipientName], description: "Manual wallet settlement subject to operator and local compliance review." },
  { id: "card-payout", name: "Card payout", family: "card", executionMode: "manual", lifecycle: "restricted", direction: "receive", compatibleCurrencyCodes: ["USD", "EUR", "GBP"], fields: [recipientName], description: "Operator-approved payout flow; never collect card numbers or security data." },
  { id: "cash-pickup", name: "Cash pickup", family: "cash", executionMode: "manual", lifecycle: "restricted", direction: "receive", compatibleCurrencyCodes: ["USD", "EUR", "GBP", "KES", "PHP", "MXN"], fields: [recipientName], description: "Operator-arranged payout only; recipient identification and availability are confirmed outside this catalog." },
] as const satisfies readonly PaymentMethodCatalogItem[];

export const FIAT_PAYMENT_METHOD_ATTACHMENTS: readonly FiatPaymentMethodAttachment[] =
  PAYMENT_METHOD_CATALOG.flatMap((method) =>
    method.compatibleCurrencyCodes.map((currencyCode) => ({
      id: `${method.id}:${currencyCode}`,
      paymentMethodId: method.id,
      currencyCode,
      direction: method.direction,
      lifecycle: method.lifecycle,
    })),
  );

export const CRYPTO_ASSET_CATALOG = [
  ["btc", "BTC", "Bitcoin", 8], ["eth", "ETH", "Ethereum", 18],
  ["usdt", "USDT", "Tether", 6], ["usdc", "USDC", "USD Coin", 6],
  ["bnb", "BNB", "BNB", 18], ["sol", "SOL", "Solana", 9],
  ["xrp", "XRP", "XRP", 6], ["xlm", "XLM", "Stellar", 7],
  ["ton", "TON", "Toncoin", 9], ["trx", "TRX", "TRON", 6],
  ["ltc", "LTC", "Litecoin", 8], ["doge", "DOGE", "Dogecoin", 8],
  ["bch", "BCH", "Bitcoin Cash", 8], ["ada", "ADA", "Cardano", 6],
  ["dot", "DOT", "Polkadot", 10], ["avax", "AVAX", "Avalanche", 18],
  ["pol", "POL", "Polygon", 18], ["dai", "DAI", "Dai", 18],
  ["xmr", "XMR", "Monero", 12],
].map(([id, code, name, decimals]) => ({
  id: id as string,
  code: code as string,
  name: name as string,
  decimals: decimals as number,
  lifecycle: "active" as const,
})) satisfies readonly CryptoAssetCatalogItem[];

export const CRYPTO_NETWORK_CATALOG = [
  ["btc-bitcoin", "btc", "BTC", "Bitcoin", 8, false, 1],
  ["eth-ethereum", "eth", "ERC20", "Ethereum", 18, false, 12],
  ["usdt-erc20", "usdt", "ERC20", "Ethereum", 6, false, 12],
  ["usdt-trc20", "usdt", "TRC20", "Tron", 6, false, 19],
  ["usdt-bep20", "usdt", "BEP20", "BNB Smart Chain", 6, false, 15],
  ["usdt-solana", "usdt", "SPL", "Solana", 6, false, 32],
  ["usdt0-polygon", "usdt", "POLYGON", "Polygon", 6, false, 128],
  ["usdt-arbitrum", "usdt", "ARBITRUM", "Arbitrum One", 6, false, 1],
  ["usdt-base", "usdt", "BASE", "Base", 6, false, 1],
  ["usdt-avalanche-c", "usdt", "AVAXC", "Avalanche C-Chain", 6, false, 1],
  ["usdt-ton", "usdt", "TON", "The Open Network", 6, true, 1],
  ["usdc-erc20", "usdc", "ERC20", "Ethereum", 6, false, 12],
  ["usdc-solana", "usdc", "SPL", "Solana", 6, false, 32],
  ["usdc-polygon", "usdc", "POLYGON", "Polygon PoS", 6, false, 128],
  ["usdc-arbitrum", "usdc", "ARBITRUM", "Arbitrum One", 6, false, 1],
  ["usdc-base", "usdc", "BASE", "Base", 6, false, 1],
  ["usdc-bep20", "usdc", "BEP20", "BNB Smart Chain", 6, false, 15],
  ["dai-erc20", "dai", "ERC20", "Ethereum", 18, false, 12],
  ["sol-solana", "sol", "SOL", "Solana", 9, false, 32],
  ["trx-tron", "trx", "TRC20", "Tron", 6, false, 19],
  ["bnb-bep20", "bnb", "BEP20", "BNB Smart Chain", 18, false, 15],
  ["xrp-xrpl", "xrp", "XRPL", "XRP Ledger", 6, true, 1],
  ["xlm-stellar", "xlm", "XLM", "Stellar", 7, true, 1],
  ["ton-ton", "ton", "TON", "The Open Network", 9, true, 1],
  ["ltc-litecoin", "ltc", "LTC", "Litecoin", 8, false, 6],
  ["doge-dogecoin", "doge", "DOGE", "Dogecoin", 8, false, 6],
  ["bch-bitcoin-cash", "bch", "BCH", "Bitcoin Cash", 8, false, 6],
  ["ada-cardano", "ada", "ADA", "Cardano", 6, false, 15],
  ["dot-polkadot", "dot", "DOT", "Polkadot", 10, false, 1],
  ["avax-c-chain", "avax", "AVAXC", "Avalanche C-Chain", 18, false, 1],
  ["pol-polygon", "pol", "POLYGON", "Polygon PoS", 18, false, 128],
  ["xmr-monero", "xmr", "XMR", "Monero", 12, false, 10],
].map(([id, assetId, networkCode, networkName, decimals, requiresMemo, defaultRequiredConfirmations]) => ({
  id: id as string,
  assetId: assetId as string,
  networkCode: networkCode as string,
  networkName: networkName as string,
  decimals: decimals as number,
  requiresMemo: requiresMemo as boolean,
  defaultRequiredConfirmations: defaultRequiredConfirmations as number,
  lifecycle: "active" as const,
})) satisfies readonly CryptoNetworkCatalogItem[];

export function findPaymentMethodCatalogItem(id: string): PaymentMethodCatalogItem | undefined {
  return PAYMENT_METHOD_CATALOG.find((item) => item.id === id);
}

export function paymentMethodsForCurrency(currencyCode: string): readonly PaymentMethodCatalogItem[] {
  const normalized = currencyCode.trim().toUpperCase();
  return PAYMENT_METHOD_CATALOG.filter((item) => {
    const compatibleCurrencyCodes: readonly string[] = item.compatibleCurrencyCodes;
    return compatibleCurrencyCodes.includes(normalized);
  });
}