import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminConvertDefaultPairQueryKey,
  getGetQuickexConfigQueryKey,
  useGetAdminConvertDefaultPair,
  useGetQuickexConfig,
  useUpdateAdminConvertDefaultPair,
  type QuickexInstrument,
  type QuickexPair,
} from '@workspace/api-client-react';
import { notifyAdminAction } from './admin-action-toast';

const instrumentKey = (asset: string, network: string) =>
  `${asset.trim().toUpperCase()}\0${network.trim().toUpperCase()}`;

const pairKey = (pair: QuickexPair) =>
  `${instrumentKey(pair.fromAsset, pair.fromNetwork)}\0${instrumentKey(pair.toAsset, pair.toNetwork)}`;

const label = (instrument: QuickexInstrument) =>
  `${instrument.currencyTitle} · ${instrument.networkTitle}`;

type Draft = { fromSlug: string; toSlug: string };

export function AdminConvertDefaultPair({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const config = useGetQuickexConfig({
    query: { queryKey: getGetQuickexConfigQueryKey(), staleTime: 0, refetchOnMount: 'always' },
  });
  const saved = useGetAdminConvertDefaultPair({
    query: { queryKey: getGetAdminConvertDefaultPairQueryKey(), staleTime: 0, refetchOnMount: 'always' },
  });
  const update = useUpdateAdminConvertDefaultPair();
  const [draft, setDraft] = useState<Draft | null>(null);

  const instruments = useMemo(() => (config.data?.instruments ?? []).filter(instrument =>
    instrument.instrumentType.toLowerCase() === 'crypto' &&
    instrument.currencyTitle.trim().length >= 2 &&
    instrument.networkTitle.trim().length >= 1
  ), [config.data?.instruments]);
  const byKey = useMemo(() => new Map(instruments.map(instrument => [
    instrumentKey(instrument.currencyTitle, instrument.networkTitle), instrument,
  ])), [instruments]);
  const routes = useMemo(() => (config.data?.pairs ?? []).filter(pair =>
    byKey.has(instrumentKey(pair.fromAsset, pair.fromNetwork)) &&
    byKey.has(instrumentKey(pair.toAsset, pair.toNetwork))
  ), [config.data?.pairs, byKey]);
  const storedPair = saved.data?.pair;
  const storedIsEligible = Boolean(storedPair && routes.some(route => pairKey(route) === pairKey(storedPair)));

  useEffect(() => {
    if (!saved.data || !config.data || draft) return;
    const selected = routes.find(route => storedPair && pairKey(route) === pairKey(storedPair)) ?? routes[0];
    setDraft(selected ? {
      fromSlug: byKey.get(instrumentKey(selected.fromAsset, selected.fromNetwork))?.slug ?? '',
      toSlug: byKey.get(instrumentKey(selected.toAsset, selected.toNetwork))?.slug ?? '',
    } : { fromSlug: '', toSlug: '' });
  }, [saved.data, config.data, draft, routes, storedPair, byKey]);

  const sourceKeys = useMemo(() => new Set(routes.map(route =>
    instrumentKey(route.fromAsset, route.fromNetwork)
  )), [routes]);
  const sourceOptions = instruments.filter(instrument =>
    sourceKeys.has(instrumentKey(instrument.currencyTitle, instrument.networkTitle))
  );
  const source = instruments.find(instrument => instrument.slug === draft?.fromSlug);
  const targetKeys = useMemo(() => new Set(routes.filter(route => source &&
    instrumentKey(route.fromAsset, route.fromNetwork) ===
      instrumentKey(source.currencyTitle, source.networkTitle)
  ).map(route => instrumentKey(route.toAsset, route.toNetwork))), [routes, source]);
  const targetOptions = instruments.filter(instrument =>
    targetKeys.has(instrumentKey(instrument.currencyTitle, instrument.networkTitle))
  );
  const target = targetOptions.find(instrument => instrument.slug === draft?.toSlug);
  const selectedRoute = routes.find(route => source && target &&
    instrumentKey(route.fromAsset, route.fromNetwork) === instrumentKey(source.currencyTitle, source.networkTitle) &&
    instrumentKey(route.toAsset, route.toNetwork) === instrumentKey(target.currencyTitle, target.networkTitle)
  );
  const changed = Boolean(selectedRoute && (!storedPair || pairKey(selectedRoute) !== pairKey(storedPair)));

  const save = async () => {
    if (!selectedRoute || !changed || update.isPending) return;
    try {
      await update.mutateAsync({ data: {
        fromAsset: selectedRoute.fromAsset,
        fromNetwork: selectedRoute.fromNetwork,
        toAsset: selectedRoute.toAsset,
        toNetwork: selectedRoute.toNetwork,
      } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAdminConvertDefaultPairQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetQuickexConfigQueryKey() }),
      ]);
      notifyAdminAction('success', 'Default Convert pair saved. New visitors will see this pair first.');
    } catch {
      await queryClient.invalidateQueries({ queryKey: getGetQuickexConfigQueryKey() });
      notifyAdminAction('error', 'Could not save this pair. Check that it is still available and try again.');
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Convert Default Widget Pair" data-testid="admin-convert-default-pair">
      <h2 className="text-base font-bold text-foreground">Convert Default Widget Pair</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose the pair visitors see when Convert first opens. All other available pairs remain selectable.
      </p>
      {(config.isLoading || saved.isLoading) && <p className="mt-4 text-sm text-muted-foreground">Loading available Convert pairs…</p>}
      {(config.isError || saved.isError) && <p className="mt-4 text-sm text-destructive" role="alert">Could not load the current Convert settings. Try again later.</p>}
      {config.data && saved.data && (
        <>
          {!routes.length && <p className="mt-4 text-sm text-muted-foreground" role="status">
            No eligible public Convert pair is currently available. This setting does not enable or disable pairs.
          </p>}
          {storedPair && !storedIsEligible && routes.length > 0 && (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-300" role="status">
              The saved pair is no longer available. Visitors currently see the first eligible pair instead.
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
              Default You Send
              <select className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground"
                data-testid="select-default-convert-send"
                value={draft?.fromSlug ?? ''}
                disabled={!canManage || !routes.length || !draft}
                onChange={event => {
                  const nextSource = instruments.find(item => item.slug === event.target.value);
                  const compatible = routes.filter(route => nextSource &&
                    instrumentKey(route.fromAsset, route.fromNetwork) ===
                    instrumentKey(nextSource.currencyTitle, nextSource.networkTitle)
                  );
                  const nextTarget = compatible.some(route => target &&
                    instrumentKey(route.toAsset, route.toNetwork) === instrumentKey(target.currencyTitle, target.networkTitle))
                    ? target
                    : byKey.get(instrumentKey(compatible[0]?.toAsset ?? '', compatible[0]?.toNetwork ?? ''));
                  setDraft({ fromSlug: event.target.value, toSlug: nextTarget?.slug ?? '' });
                }}>
                {!sourceOptions.length && <option value="">No available pair</option>}
                {sourceOptions.map(item => <option key={item.slug} value={item.slug}>{label(item)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
              Default You Receive
              <select className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground"
                data-testid="select-default-convert-receive"
                value={draft?.toSlug ?? ''}
                disabled={!canManage || !targetOptions.length || !draft}
                onChange={event => {
                  setDraft(current => current ? { ...current, toSlug: event.target.value } : current);
                }}>
                {!targetOptions.length && <option value="">No available pair</option>}
                {targetOptions.map(item => <option key={item.slug} value={item.slug}>{label(item)}</option>)}
              </select>
            </label>
          </div>
          {canManage && <button type="button" className="button button-primary mt-4" data-testid="button-save-default-convert-pair"
            onClick={save} disabled={!selectedRoute || !changed || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Default Pair'}
          </button>}
        </>
      )}
    </section>
  );
}