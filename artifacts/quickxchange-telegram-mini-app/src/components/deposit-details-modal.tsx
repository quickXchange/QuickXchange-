import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { formatDisplayAmount } from '@workspace/amount-format';
import { useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type DepositDetailsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  asset: string;
  network?: string | null;
  address: string;
  qrData?: string | null;
  memo?: string | null;
  orderId: string;
  copied: string | null;
  onCopy: (value: string) => Promise<boolean>;
  actionable: boolean;
};

function CopyButton({
  value,
  copied,
  onCopy,
  label,
}: {
  value: string;
  copied: string | null;
  onCopy: (value: string) => void;
  label: string;
}) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const isCopied = copied === value;
  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      aria-label={isCopied ? uiT("customer.m42116c7be636", { v0: label }) : uiT("customer.m3f3ebff426db", { v0: label.toLowerCase() })}
      data-testid={label === 'Memo' ? 'button-copy-deposit-memo' : 'button-copy-deposit'}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-background/80 text-primary transition-colors hover:bg-primary/10"
    >
      {isCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export function DepositDetailsModal({
  open,
  onOpenChange,
  amount,
  asset,
  network,
  address,
  qrData,
  memo,
  orderId,
  copied,
  onCopy,
  actionable,
}: DepositDetailsModalProps) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const networkLabel = network?.trim() || 'shown';
  const [copyAnnouncement, setCopyAnnouncement] = useState('');

  const copy = async (value: string) => {
    const succeeded = await onCopy(value);
    if (succeeded) setCopyAnnouncement(`${value === amount ? 'Exact amount' : value === memo ? 'Memo' : 'Deposit address'} copied.`);
    else setCopyAnnouncement('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="dialog-deposit-details"
        className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-20px)] w-[calc(100vw-20px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-3xl border border-primary/20 bg-background p-0 shadow-2xl sm:max-h-[min(820px,calc(100dvh-32px))]"
      >
          <header className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{uiT("customer.me0830c934a54")}</p>
              <DialogTitle className="mt-1 text-lg font-bold">{uiT("customer.m1825e5b40ef1")}</DialogTitle>
              <DialogDescription className="mt-1 text-xs">{uiT("customer.m6761c45da3b7")}</DialogDescription>
            </div>
          </header>

          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <section className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {actionable ? uiT("customer.m24f1a45be786") : uiT("customer.m4341dcab36b5")}
              </p>
              <p className="mt-1 break-words font-mono text-2xl font-extrabold text-foreground">
                {formatDisplayAmount(amount)} <span className="font-sans text-base text-primary">{asset}</span>
              </p>
              <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => void copy(amount)} data-testid="button-copy-deposit-amount">
                {copied === amount ? uiT("customer.m2c2ab3766561") : uiT("customer.mf028cc5ef689")}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">{uiT("customer.m07e00ebc6582")}</p>
              {network && <p className="mt-1 text-xs font-semibold text-muted-foreground">{network}</p>}
            </section>

            <div className="space-y-3">
              <section className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{uiT("customer.m74ff6fad383a")}</div>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{address}</code>
                  {actionable && <CopyButton value={address} copied={copied} onCopy={copy} label={uiT("customer.m74ff6fad383a")} />}
                </div>
              </section>

              {memo && (
                <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
                  <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {uiT("customer.mb215f476a86d")}{actionable ? uiT("customer.m703e5ed39d8e") : uiT("customer.m2b6e54ea0009")}
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold leading-relaxed">{uiText(memo)}</code>
                    {actionable && <CopyButton value={memo} copied={copied} onCopy={copy} label={uiT("customer.m64cecb8a6ef3")} />}
                  </div>
                </section>
              )}
            </div>

            {actionable && (
              <div className="flex flex-col items-center gap-2">
                <div role="img" aria-label={uiT("customer.md92914c23de9")} data-testid="qr-deposit-address" className="rounded-2xl bg-white p-3 shadow-md">
                  <QRCodeSVG value={qrData || address} size={160} level="M" includeMargin={false} />
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">{uiT("customer.md31a7627562a")}</span>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="text-foreground">{uiT("customer.m3bf34fc38125")}</strong> {' '}{uiT("customer.m39de0a373cc3")}{' '}{networkLabel}{uiT("customer.m7a767f503c01")}</span>
            </div>

            {actionable ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{uiT("customer.md31c52d71df2")}{' '}{asset} {' '}{uiT("customer.m51baf1bef5d3")}{' '}{networkLabel} {' '}{uiT("customer.m6cf96544c1c4")}</span>
              </div>
            ) : (
              <div role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3 text-center text-xs font-bold text-amber-800 dark:text-amber-200">
                {uiT("customer.m105c893198a9")}{' '}</div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
              <span>{uiT("customer.md89d8487ce82")}</span>
              <code className="break-all text-right font-semibold">{uiText(orderId)}</code>
            </div>
            <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
              {uiT("customer.m02f1697cb2ad")}{' '}</p>
            <p className="sr-only" aria-live="polite">{uiText(copyAnnouncement)}</p>
          </div>
      </DialogContent>
    </Dialog>
  );
}