import { useEffect, useMemo, useState } from 'react';
import {
  getGetAdminSwapDefaultPairQueryKey,
  getGetExchangeConfigQueryKey,
  useGetAdminSwapDefaultPair,
  useGetExchangeConfig,
  useUpdateAdminSwapDefaultPair,
  type SettlementOption,
  type SwapDefaultPair,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

function optionLabel(option: SettlementOption): string {
  return option.kind === 'crypto-network'
    ? `${option.assetCode} · ${option.routeNetwork}`
    : `${option.title} · ${option.assetCode}`;
}

export function AdminSwapDefaultPair({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const config = useGetExchangeConfig({
    query: { queryKey: getGetExchangeConfigQueryKey(), staleTime: 0, refetchOnMount: 'always' },
  });
  const saved = useGetAdminSwapDefaultPair({
    query: { queryKey: getGetAdminSwapDefaultPairQueryKey(), staleTime: 0, refetchOnMount: 'always' },
  });
  const update = useUpdateAdminSwapDefaultPair();
  const [draft, setDraft] = useState<SwapDefaultPair | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const options = config.data?.manualSettlementOptions ?? [];
  const optionById = useMemo(() => new Map(options.map(option => [option.id, option])), [options]);
  const routes = (config.data?.manualRouteAvailability?.routes ?? []).filter(route =>
    optionById.has(route.sourceSettlementOptionId) && optionById.has(route.targetSettlementOptionId)
  );
  const storedPair = saved.data?.pair;
  const storedIsEligible = Boolean(storedPair && routes.some(route =>
    route.sourceSettlementOptionId === storedPair.sourceSettlementOptionId &&
    route.targetSettlementOptionId === storedPair.targetSettlementOptionId
  ));

  useEffect(() => {
    if (!saved.data || !config.data || draft) return;
    const pair = saved.data.pair;
    const eligible = pair && routes.some(route =>
      route.sourceSettlementOptionId === pair.sourceSettlementOptionId &&
      route.targetSettlementOptionId === pair.targetSettlementOptionId
    );
    const first = routes[0];
    setDraft(eligible ? pair : first
      ? { sourceSettlementOptionId: first.sourceSettlementOptionId, targetSettlementOptionId: first.targetSettlementOptionId }
      : { sourceSettlementOptionId: '', targetSettlementOptionId: '' });
  }, [saved.data, config.data, draft, routes]);

  const sources = options.filter(option =>
    routes.some(route => route.sourceSettlementOptionId === option.id)
  );
  const targets = options.filter(option =>
    routes.some(route =>
      route.sourceSettlementOptionId === draft?.sourceSettlementOptionId &&
      route.targetSettlementOptionId === option.id
    )
  );
  const validDraft = Boolean(draft && routes.some(route =>
    route.sourceSettlementOptionId === draft.sourceSettlementOptionId &&
    route.targetSettlementOptionId === draft.targetSettlementOptionId
  ));
  const changed = draft?.sourceSettlementOptionId !== storedPair?.sourceSettlementOptionId ||
    draft?.targetSettlementOptionId !== storedPair?.targetSettlementOptionId;

  const save = async () => {
    if (!draft || !validDraft || !changed || update.isPending) return;
    setNotice(null);
    try {
      await update.mutateAsync({ data: draft });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminSwapDefaultPairQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() }),
      ]);
      setNotice('Default Swap pair saved. New visitors will see this pair first.');
    } catch {
      await queryClient.invalidateQueries({ queryKey: getGetExchangeConfigQueryKey() });
      setNotice('Could not save this pair. Check that it is still available and try again.');
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Featured / Default Widget Pair" data-testid="admin-swap-default-pair">
      <h2 className="text-base font-bold text-foreground">Featured / Default Widget Pair</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose the pair visitors see when Swap first opens. All other available pairs remain selectable.
      </p>
      {(config.isLoading || saved.isLoading) && <p className="mt-4 text-sm text-muted-foreground">Loading available Swap pairs…</p>}
      {(config.isError || saved.isError) && <p className="mt-4 text-sm text-destructive" role="alert">Could not load the current Swap settings. Refresh to try again.</p>}
      {config.data && saved.data && (
        <>
          {!routes.length && (
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              No eligible public Swap pair is currently available. This setting does not enable or disable pairs.
            </p>
          )}
          {storedPair && !storedIsEligible && routes.length > 0 && (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-300" role="status">
              The saved pair is no longer available. Visitors currently see the first eligible pair instead.
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
              Default You Send
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground"
                data-testid="select-default-swap-send"
                value={draft?.sourceSettlementOptionId ?? ''}
                disabled={!canManage || !routes.length || !draft}
                onChange={event => {
                  const sourceSettlementOptionId = event.target.value;
                  const matching = routes.filter(route => route.sourceSettlementOptionId === sourceSettlementOptionId);
                  const targetSettlementOptionId = matching.some(route => route.targetSettlementOptionId === draft?.targetSettlementOptionId)
                    ? draft!.targetSettlementOptionId
                    : matching[0]?.targetSettlementOptionId ?? '';
                  setDraft({ sourceSettlementOptionId, targetSettlementOptionId });
                  setNotice(null);
                }}
              >
                {!sources.length && <option value="">No available pair</option>}
                {sources.map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
              Default You Receive
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground"
                data-testid="select-default-swap-receive"
                value={draft?.targetSettlementOptionId ?? ''}
                disabled={!canManage || !targets.length || !draft}
                onChange={event => {
                  setDraft(current => current
                    ? { ...current, targetSettlementOptionId: event.target.value }
                    : current);
                  setNotice(null);
                }}
              >
                {!targets.length && <option value="">No available pair</option>}
                {targets.map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}
              </select>
            </label>
          </div>
          {canManage && (
            <button type="button" className="button button-primary mt-4" data-testid="button-save-default-swap-pair"
              onClick={save} disabled={!validDraft || !changed || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save Default Pair'}
            </button>
          )}
          {notice && <p className="mt-3 text-sm text-foreground" role="status">{notice}</p>}
        </>
      )}
    </section>
  );
}