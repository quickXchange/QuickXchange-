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
  const [copyError, setCopyError] = useState(false);
  if (!transaction?.transactionHash) return null;
  const hash = transaction.transactionHash;
  const shortHash = hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
  const copy = async () => {
    setCopied(false);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 p-4" data-testid="verified-transaction">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transaction ID</div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <code className="block min-w-0 w-full truncate rounded-lg bg-background/70 px-3 py-2 font-mono text-sm font-semibold text-foreground sm:flex-1" title={hash} aria-label={`Transaction ID ${hash}`}>
          <span className="sm:hidden">{shortHash}</span>
          <span className="hidden sm:inline">{hash}</span>
        </code>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" onClick={copy} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Copy full transaction ID">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? "Copied" : "Copy"}
          </button>
          {transaction.explorerUrl && (
            <a href={transaction.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${shortHash} on block explorer (opens in a new tab)`} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <ExternalLink size={14} aria-hidden="true" /> {admin ? "View on Explorer" : "View on Explorer"}
            </a>
          )}
        </div>
      </div>
      <div className="sr-only" aria-live="polite" role="status">{copied ? "Transaction ID copied." : copyError ? "Could not copy transaction ID." : ""}</div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Network: <strong className="text-foreground">{transaction.networkName || transaction.networkCode || "—"}</strong></span>
        <span>Confirmations: <strong className="text-foreground">{transaction.confirmations}</strong></span>
        {transaction.detectedAt && <span>Detected: <strong className="text-foreground">{new Date(transaction.detectedAt).toLocaleString()}</strong></span>}
      </div>
    </div>
  );
}