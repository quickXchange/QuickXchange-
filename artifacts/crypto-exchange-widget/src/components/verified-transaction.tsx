import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

export type VerifiedFundingTransaction = {
  transactionHash: string;
  networkCode?: string | null;
  networkName?: string | null;
  confirmations: number | string;
  detectedAt?: string | null;
  explorerUrl?: string;
};

export function VerifiedTransaction({
  transaction,
  admin = false,
}: {
  transaction?: VerifiedFundingTransaction | null;
  admin?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!transaction?.transactionHash) return null;
  const hash = transaction.transactionHash;
  const shortHash = hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
  const copy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4" data-testid="verified-transaction">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transaction ID</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground" title={hash}>{shortHash}</code>
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted" aria-label="Copy transaction ID">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
        </button>
        {transaction.explorerUrl && (
          <a href={transaction.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-muted">
            <ExternalLink size={14} /> {admin ? "View on Explorer" : "View on Explorer"}
          </a>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Network: <strong className="text-foreground">{transaction.networkName || transaction.networkCode}</strong></span>
        <span>Confirmations: <strong className="text-foreground">{transaction.confirmations}</strong></span>
        {transaction.detectedAt && <span>Detected: <strong className="text-foreground">{new Date(transaction.detectedAt).toLocaleString()}</strong></span>}
      </div>
    </div>
  );
}