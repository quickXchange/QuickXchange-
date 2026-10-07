import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { formatDisplayAmount } from '@workspace/amount-format';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, CircleAlert, Copy, Network, ShieldCheck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { NetworkBadge } from '@workspace/payment-logo';
import { OrderSettlementIdentity } from '@/components/order-settlement-identity';
import './deposit-details-modal.css';

export type DepositDetailsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  asset: string;
  network?: string | null;
  settlementOptionId?: string | null;
  address: string;
  memo?: string | null;
  orderId: string;
  warning?: string | null;
  instructions?: string | null;
  requiredConfirmations?: string | null;
  copied: string | null;
  onCopy: (value: string) => void;
  actionable: boolean;
};

export function DepositDetailsModal({
  open,
  onOpenChange,
  amount,
  asset,
  network,
  settlementOptionId,
  address,
  memo,
  orderId,
  warning,
  instructions,
  requiredConfirmations,
  copied,
  onCopy,
  actionable,
}: DepositDetailsModalProps) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const hasMemo = Boolean(memo?.trim());
  const hasWarning = Boolean(warning?.trim());
  const hasInstructions = Boolean(instructions?.trim());
  const hasConfirmations = Boolean(requiredConfirmations?.trim());
  const isNativeNetwork = Boolean(network && network.trim().toLowerCase() === asset.trim().toLowerCase());

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="deposit-details-modal-overlay" />
        <Dialog.Content className="deposit-details-modal-content" data-testid="dialog-deposit-details"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}>
          <header className="deposit-details-modal-header">
            <div className="deposit-details-modal-heading">
              <span className="deposit-details-modal-eyebrow">{uiT("customer.m8aad2499c916")}</span>
              <Dialog.Title className="deposit-details-modal-title">{uiT("customer.m1825e5b40ef1")}</Dialog.Title>
              <Dialog.Description className="deposit-details-modal-description">
                {uiT("customer.m47ad005ba45b")}{' '}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="deposit-details-modal-close" aria-label={uiT("customer.mcabe8bf2fdaf")} data-testid="button-close-deposit-details">
                <X size={19} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="deposit-details-modal-scroll">
            <div className="deposit-details-modal-asset-panel">
              <div className="deposit-details-modal-artwork">
                <OrderSettlementIdentity assetCode={asset} routeLabel={network}
                  settlementOptionId={settlementOptionId} size="lg" compact
                  className="deposit-details-modal-identity" />
                {isNativeNetwork && (
                  <NetworkBadge network={network} size={29}
                    className="deposit-details-modal-native-network" ariaLabel={`${network} network`}>
                    <OrderSettlementIdentity assetCode={asset} routeLabel={network}
                      settlementOptionId={settlementOptionId} size="sm" compact
                      className="deposit-details-modal-native-identity" />
                  </NetworkBadge>
                )}
              </div>
              <div className="deposit-details-modal-asset-name" data-testid="text-deposit-asset">{asset}</div>
              {network && <div className="deposit-details-modal-network" data-testid="text-deposit-network">{network}</div>}
              <div className="deposit-details-modal-send-label">{uiT("customer.m24f1a45be786")}</div>
              <div className="deposit-details-modal-amount" data-testid="text-deposit-amount">
                <span>{formatDisplayAmount(amount)}</span> <span className="deposit-details-modal-amount-unit">{asset}</span>
              </div>
              <button type="button" className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-primary" onClick={() => onCopy(amount)} data-testid="button-copy-deposit-amount">
                {copied === amount ? <Check size={14} /> : <Copy size={14} />}
                {copied === amount ? uiT("customer.m2c2ab3766561") : uiT("customer.mf028cc5ef689")}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">{uiT("customer.m07e00ebc6582")}</p>
            </div>

            <div className="deposit-details-modal-fields">
              <div className="deposit-details-modal-field">
                <div className="deposit-details-modal-field-head">
                  <span className="deposit-details-modal-field-label">{uiT("customer.m74ff6fad383a")}</span>
                </div>
                <div className="deposit-details-modal-value-row">
                  <code className="deposit-details-modal-value" data-testid="text-deposit-address">{address}</code>
                  {actionable && (
                    <button type="button" className="deposit-details-modal-copy" onClick={() => onCopy(address)}
                      aria-label={copied === address ? uiT("customer.mab1b3c4b63d9") : uiT("customer.m9748880df2e7")}
                      data-testid="button-copy-deposit">
                      {copied === address ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                    </button>
                  )}
                </div>
              </div>

              {hasMemo && (
                <div className="deposit-details-modal-field">
                  <div className="deposit-details-modal-field-head">
                    <span className="deposit-details-modal-field-label">{actionable ? uiT("customer.mb215f476a86d") : uiT("customer.mf70f13e85fbd")}</span>
                  </div>
                  <div className="deposit-details-modal-value-row">
                    <code className="deposit-details-modal-value deposit-details-modal-memo" data-testid="text-deposit-memo">{uiText(memo)}</code>
                    {actionable && (
                      <button type="button" className="deposit-details-modal-copy" onClick={() => onCopy(memo!)}
                        aria-label={copied === memo ? uiT("customer.m72e2f0eda30d") : uiT("customer.m80230724928a")}
                        data-testid="button-copy-deposit-memo">
                        {copied === memo ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="deposit-details-modal-qr-block">
              <div className="deposit-details-modal-qr" role="img" aria-label={uiT("customer.md92914c23de9")}>
                <QRCodeSVG value={address} size={160} level="M" includeMargin={false} />
              </div>
              <span className="deposit-details-modal-qr-caption">{uiT("customer.md31a7627562a")}</span>
            </div>

            <div className="deposit-details-modal-notice deposit-details-modal-notice-warning deposit-details-modal-network-warning">
              <CircleAlert size={17} aria-hidden="true" />
              <p>{uiT("customer.m8a57779edfb5")}{' '}{asset} {' '}{uiT("customer.m51baf1bef5d3")}{' '}{network || uiT("customer.mbaaf53622a51")} {' '}{uiT("customer.m6d158304becd")}</p>
            </div>

            {(hasWarning || hasInstructions || hasConfirmations) && (
              <div className="deposit-details-modal-notices">
                {hasWarning && (
                  <div className="deposit-details-modal-notice deposit-details-modal-notice-warning">
                    <CircleAlert size={17} aria-hidden="true" />
                    <p data-testid="text-deposit-warning">{uiText(warning)}</p>
                  </div>
                )}
                {hasInstructions && (
                  <div className="deposit-details-modal-notice">
                    <ShieldCheck size={17} aria-hidden="true" />
                    <p data-testid="text-deposit-instructions">{uiText(instructions)}</p>
                  </div>
                )}
                {hasConfirmations && (
                  <div className="deposit-details-modal-notice">
                    <Network size={17} aria-hidden="true" />
                    <p data-testid="text-deposit-confirmations">{uiText(requiredConfirmations)}</p>
                  </div>
                )}
              </div>
            )}

            <div className="deposit-details-modal-metadata">
              <span>{uiT("customer.md89d8487ce82")}</span>
              <span className="deposit-details-modal-order-id" data-testid="text-deposit-order-id">{uiText(orderId)}</span>
            </div>
            <p className="deposit-details-modal-auto-note">
              {uiT("customer.m02f1697cb2ad")}{' '}</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}