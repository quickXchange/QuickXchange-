import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useI18n } from '@/i18n';
import { publicPageDefinition } from '@/lib/public-page-registry';
import { basePath } from '@/components/shared-app-ui';
import './order-policy-acceptance.css';

function policyHref(key: 'terms-conditions' | 'aml-kyc') {
  const page = publicPageDefinition(key);
  if (!page) throw new Error(`Missing public policy page: ${key}`);
  return `${basePath}${page.path}`;
}

const termsHref = policyHref('terms-conditions');
const amlHref = policyHref('aml-kyc');

export function OrderPolicyAcceptance({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const { t } = useI18n();
  const template = t('policyAcceptance.text');
  const terms = t('policyAcceptance.terms');
  const aml = t('policyAcceptance.aml');
  const parts = template.split(/(\{terms\}|\{aml\})/g);

  return (
    <div className="order-terms convert-terms-card policy-acceptance mt-2 flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        required
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        aria-label={uiText(template.replace('{terms}', terms).replace('{aml}', aml))}
        data-testid={`${id}-checkbox`}
        className="mt-1 w-[18px] h-[18px] rounded border-border text-primary focus:ring-primary/20 shrink-0"
      />
      <span className="policy-acceptance__copy text-[14px] font-medium text-foreground leading-relaxed">
        {parts.map((part, index) => part === '{terms}' ? (
          <a key={index} href={termsHref} target="_blank" rel="noopener noreferrer" data-testid={`${id}-terms-link`}>
            {uiText(terms)}
          </a>
        ) : part === '{aml}' ? (
          <a key={index} href={amlHref} target="_blank" rel="noopener noreferrer" data-testid={`${id}-aml-link`}>
            {uiText(aml)}
          </a>
        ) : (
          <label key={index} htmlFor={id} className="cursor-pointer select-none">{uiText(part)}</label>
        ))}
      </span>
    </div>
  );
}