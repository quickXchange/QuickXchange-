import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAdminRatesXmlQueryKey, useGetAdminRatesXml, useUpdateAdminRatesXmlMethod } from '@workspace/api-client-react';
import { notifyAdminAction } from './admin-action-toast';
import { useAdminPermissions } from '../lib/admin-permissions';

const dec = /^[0-9]{1,20}(\.[0-9]{1,12})?$/;
const STAGING_ONLY = new Set(['PMUSD', 'PMEUR']);
const input = 'w-full min-h-9 rounded-lg border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-60';
const button = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50';

export function RatesXmlMethodEditor({ optionId, mode, compact }: { optionId: string; mode: 'code-only' | 'code-and-reserve'; compact?: boolean }) {
  const { isOwner } = useAdminPermissions();
  const qc = useQueryClient();
  const q = useGetAdminRatesXml({ query: { queryKey: getGetAdminRatesXmlQueryKey(), enabled: isOwner, retry: false } });
  const save = useUpdateAdminRatesXmlMethod();
  const method = q.data?.methods.find(m => m.optionId === optionId);
  // null = untouched; drafts survive shared-query refetches and are only cleared for fields that saved.
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [reserveDraft, setReserveDraft] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => { setCodeDraft(null); setReserveDraft(null); setConflict(false); }, [optionId]);
  const code = codeDraft ?? method?.code ?? '';
  const reserve = reserveDraft ?? method?.reserve ?? '';
  const setCode = (v: string) => setCodeDraft(v);
  const setReserve = (v: string) => { setReserveDraft(v); setConflict(false); };
  const allowed = useMemo(() => {
    const type = method?.kind === 'fiat' ? 'fiat' : 'crypto';
    return (q.data?.currencyCodes ?? []).filter(c => c.type === type);
  }, [q.data?.currencyCodes, method?.kind]);
  const list = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (n ? allowed.filter(c => c.code.toLowerCase().includes(n) || c.description.toLowerCase().includes(n)) : allowed).slice(0, 80);
  }, [search, allowed]);
  if (!isOwner) return null;
  if (q.isLoading) return <div className="h-10 animate-pulse rounded-lg bg-muted" />;
  if (q.isError || !q.data || !method) {
    return <p className="field-hint" role="alert">XML metadata unavailable. <button type="button" className="underline" onClick={() => void q.refetch()}>Retry</button></p>;
  }
  const withReserve = mode === 'code-and-reserve';
  const codeChanged = codeDraft !== null && codeDraft !== (method.code ?? '');
  const reserveChanged = withReserve && reserveDraft !== null && reserveDraft !== method.reserve;
  const reserveValid = !withReserve || dec.test(reserve);
  const submit = () => {
    const data: { version: number; optionId: string; code?: string | null; reserve?: string; expectedReserve?: string } = { version: q.data!.version, optionId };
    if (codeChanged) data.code = code || null;
    if (reserveChanged) { data.reserve = reserve; data.expectedReserve = method.reserve; }
    save.mutate({ data }, {
      onSuccess: fresh => {
        qc.setQueryData(getGetAdminRatesXmlQueryKey(), fresh);
        if (codeChanged) setCodeDraft(null);
        if (reserveChanged) setReserveDraft(null);
        setConflict(false);
        notifyAdminAction('success', 'XML settings saved.');
      },
      onError: err => {
        if (reserveChanged) setConflict(true);
        notifyAdminAction('error', err instanceof Error ? err.message : 'Save failed. Latest saved values were reloaded; your typed values are kept.');
        void q.refetch();
      },
    });
  };
  const known = allowed.some(c => c.code === code);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid={`rates-xml-editor-${optionId}`}>
      {!compact && <p className="text-sm font-semibold">{method.name}</p>}
      <label className="block text-xs font-semibold text-muted-foreground">XML code
        <input className={`${input} mt-1`} placeholder="Search codes" value={search} onChange={e => setSearch(e.target.value)} disabled={save.isPending} />
        <select className={`${input} mt-1`} value={code} onChange={e => setCode(e.target.value)} disabled={save.isPending} data-testid={`rates-xml-code-${optionId}`}>
          <option value="">No code</option>
          {code && !known && <option value={code}>{code}</option>}
          {code && known && !list.some(c => c.code === code) && <option value={code}>{code}</option>}
          {list.map(c => <option key={c.code} value={c.code}>{c.code} - {c.description}{STAGING_ONLY.has(c.code) ? ' (staging only)' : ''}</option>)}
        </select>
      </label>
      {STAGING_ONLY.has(code) && <p className="text-xs font-semibold text-amber-600">Staging only: {code} is not advertised in production.</p>}
      {withReserve && (
        <label className="block text-xs font-semibold text-muted-foreground">XML reserve (informational)
          <input className={`${input} mt-1`} inputMode="decimal" value={reserve} onChange={e => setReserve(e.target.value)} disabled={save.isPending} data-testid={`rates-xml-reserve-${optionId}`} />
          {!reserveValid && <span className="text-destructive">Enter a non-negative decimal.</span>}
        </label>
      )}
      {conflict && <p className="text-xs font-semibold text-destructive" role="alert">Reserve conflict: the saved reserve is now {method.reserve}. Your typed value is kept; review it and save again.</p>}
      <button type="button" className={button} onClick={submit} disabled={save.isPending || !(codeChanged || reserveChanged) || !reserveValid}>
        {save.isPending ? 'Saving...' : 'Save XML code'}
      </button>
    </div>
  );
}
