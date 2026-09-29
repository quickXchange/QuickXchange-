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
              <span className="deposit-details-modal-eyebrow">ORDER-SPECIFIC PAYMENT DETAILS</span>
              <Dialog.Title className="deposit-details-modal-title">Crypto Deposit Details</Dialog.Title>
              <Dialog.Description className="deposit-details-modal-description">
                Payment details for this order.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="deposit-details-modal-close" aria-label="Close deposit details" data-testid="button-close-deposit-details">
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
              <div className="deposit-details-modal-send-label">Send exactly</div>
              <div className="deposit-details-modal-amount" data-testid="text-deposit-amount">
                <span>{amount}</span> <span className="deposit-details-modal-amount-unit">{asset}</span>
              </div>
            </div>

            <div className="deposit-details-modal-fields">
              <div className="deposit-details-modal-field">
                <div className="deposit-details-modal-field-head">
                  <span className="deposit-details-modal-field-label">Deposit address</span>
                </div>
                <div className="deposit-details-modal-value-row">
                  <code className="deposit-details-modal-value" data-testid="text-deposit-address">{address}</code>
                  {actionable && (
                    <button type="button" className="deposit-details-modal-copy" onClick={() => onCopy(address)}
                      aria-label={copied === address ? 'Deposit address copied' : 'Copy deposit address'}
                      data-testid="button-copy-deposit">
                      {copied === address ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                    </button>
                  )}
                </div>
              </div>

              {hasMemo && (
                <div className="deposit-details-modal-field">
                  <div className="deposit-details-modal-field-head">
                    <span className="deposit-details-modal-field-label">{actionable ? 'Memo / Tag' : 'Memo / Tag recorded'}</span>
                  </div>
                  <div className="deposit-details-modal-value-row">
                    <code className="deposit-details-modal-value deposit-details-modal-memo" data-testid="text-deposit-memo">{memo}</code>
                    {actionable && (
                      <button type="button" className="deposit-details-modal-copy" onClick={() => onCopy(memo!)}
                        aria-label={copied === memo ? 'Deposit memo copied' : 'Copy deposit memo'}
                        data-testid="button-copy-deposit-memo">
                        {copied === memo ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="deposit-details-modal-qr-block">
              <div className="deposit-details-modal-qr" role="img" aria-label="QR code for deposit address">
                <QRCodeSVG value={address} size={160} level="M" includeMargin={false} />
              </div>
              <span className="deposit-details-modal-qr-caption">Scan the deposit address</span>
            </div>

            <div className="deposit-details-modal-notice deposit-details-modal-notice-warning deposit-details-modal-network-warning">
              <CircleAlert size={17} aria-hidden="true" />
              <p>Send only {asset} on the {network || 'shown'} network. Using another network may result in permanent loss.</p>
            </div>

            {(hasWarning || hasInstructions || hasConfirmations) && (
              <div className="deposit-details-modal-notices">
                {hasWarning && (
                  <div className="deposit-details-modal-notice deposit-details-modal-notice-warning">
                    <CircleAlert size={17} aria-hidden="true" />
                    <p data-testid="text-deposit-warning">{warning}</p>
                  </div>
                )}
                {hasInstructions && (
                  <div className="deposit-details-modal-notice">
                    <ShieldCheck size={17} aria-hidden="true" />
                    <p data-testid="text-deposit-instructions">{instructions}</p>
                  </div>
                )}
                {hasConfirmations && (
                  <div className="deposit-details-modal-notice">
                    <Network size={17} aria-hidden="true" />
                    <p data-testid="text-deposit-confirmations">{requiredConfirmations}</p>
                  </div>
                )}
              </div>
            )}

            <div className="deposit-details-modal-metadata">
              <span>Order ID</span>
              <span className="deposit-details-modal-order-id" data-testid="text-deposit-order-id">{orderId}</span>
            </div>
            <p className="deposit-details-modal-auto-note">
              Blockchain payment detection is automatic. No action is needed after sending.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}