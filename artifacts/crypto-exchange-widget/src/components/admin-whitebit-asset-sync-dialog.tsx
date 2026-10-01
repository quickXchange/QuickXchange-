import { useI18n } from '../i18n/provider';
import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePreviewWhitebitAssetImport,
  getPreviewWhitebitAssetImportQueryKey,
  useImportWhitebitAssets,
  getGetCryptoAssetsQueryKey,
  getGetCryptoNetworksQueryKey,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { AdminSearch } from './admin-search';
import type { WhitebitAssetImportCandidate } from '@workspace/api-client-react';

interface AdminWhitebitAssetSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminWhitebitAssetSyncDialog({ open, onOpenChange }: AdminWhitebitAssetSyncDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  // Only run preview query when dialog is open
  const previewQuery = usePreviewWhitebitAssetImport({
    query: {
      enabled: open,
      queryKey: getPreviewWhitebitAssetImportQueryKey()
    }
  });

  const importMutation = useImportWhitebitAssets();

  // Reset state when opened/closed
  useEffect(() => {
    if (open) {
      setSearchTerm('');
      setPageSize(15);
      setPage(1);
      setSelectedTickers(new Set());
      importMutation.reset();
    }
  }, [open]);

  // Filter missing candidates
  const filteredCandidates = useMemo(() => {
    if (!previewQuery.data?.assets) return [];
    const lowerSearch = searchTerm.toLowerCase().trim();
    return previewQuery.data.assets.filter(asset => {
      if (!lowerSearch) return true;
      return (
        asset.providerTicker.toLowerCase().includes(lowerSearch) ||
        asset.name.toLowerCase().includes(lowerSearch) ||
        asset.normalizedTicker.toLowerCase().includes(lowerSearch) ||
        asset.networks.some(n => n.providerNetwork.toLowerCase().includes(lowerSearch))
      );
    });
  }, [previewQuery.data?.assets, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setSelectedTickers(new Set());
  }, [searchTerm, page, pageSize]);
  
  const paginatedCandidates = filteredCandidates.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  // Selection
  const allVisibleSelected = paginatedCandidates.length > 0 && paginatedCandidates.every(c => selectedTickers.has(c.providerTicker));

  const toggleAllVisible = (checked: boolean) => {
    const newSelected = new Set(selectedTickers);
    paginatedCandidates.forEach(c => {
      if (checked) {
        newSelected.add(c.providerTicker);
      } else {
        newSelected.delete(c.providerTicker);
      }
    });
    setSelectedTickers(newSelected);
  };

  const toggleTicker = (ticker: string, checked: boolean) => {
    const newSelected = new Set(selectedTickers);
    if (checked) newSelected.add(ticker);
    else newSelected.delete(ticker);
    setSelectedTickers(newSelected);
  };

  const handleImport = async () => {
    if (selectedTickers.size === 0) return;
    try {
      await importMutation.mutateAsync({
        data: {
          providerTickers: Array.from(selectedTickers)
        }
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: getPreviewWhitebitAssetImportQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCryptoAssetsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCryptoNetworksQueryKey() });
      setSelectedTickers(new Set());
    } catch (err) {
      // Error handled by mutation state
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <div className="p-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle>{t('adminCatalog.syncWithWhitebit')}</DialogTitle>
            <DialogDescription>{t('adminCatalog.syncWhitebitDescription')}</DialogDescription>
          </DialogHeader>
          
          {previewQuery.data && !importMutation.isSuccess && (
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="metric-card p-4 rounded-lg border border-border bg-card">
                <div className="text-sm text-muted-foreground">{t('adminCatalog.whitebitAssets')}</div>
                <div className="text-2xl font-semibold mt-1">{previewQuery.data.total}</div>
              </div>
              <div className="metric-card p-4 rounded-lg border border-border bg-card">
                <div className="text-sm text-muted-foreground">{t('adminCatalog.alreadyInQuickXchange')}</div>
                <div className="text-2xl font-semibold mt-1">{previewQuery.data.alreadyExisting}</div>
              </div>
              <div className="metric-card p-4 rounded-lg border border-border bg-primary/10">
                <div className="text-sm text-primary font-medium">{t('adminCatalog.newAssets')}</div>
                <div className="text-2xl font-semibold mt-1 text-primary">{previewQuery.data.missing}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          {previewQuery.isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
              <p>{t('adminCatalog.syncPreviewLoading')}</p>
            </div>
          ) : previewQuery.isError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-destructive">
              <AlertCircle className="h-8 w-8 mb-4" />
              <p>{t('adminCatalog.syncPreviewError')}</p>
              <button className="button button-outline mt-4" onClick={() => previewQuery.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" /> {t('common.retry')}
              </button>
            </div>
          ) : importMutation.isSuccess && importMutation.data ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
              <div className="h-16 w-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-6">
                <Check className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('adminCatalog.importSummary')}</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {t('adminCatalog.importSuccess', { imported: importMutation.data.imported.length, skipped: importMutation.data.skipped.length })}
              </p>
              <button className="button button-primary mt-8" onClick={() => onOpenChange(false)}>
                {t('common.close')}
              </button>
            </div>
          ) : previewQuery.data ? (
            <>
              <div className="p-4 border-b border-border flex flex-wrap items-center gap-4 bg-muted/30">
                <div className="flex-1 min-w-[200px]">
                  <AdminSearch
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder={t('adminCatalog.searchMissingAssets')}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t('genericUi.perPageLabel')}</span>
                  <select
                    className="input py-1.5 h-auto text-sm w-auto pr-8"
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[15, 25, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <div className="table-wrap h-full">
                  <table className="admin-table w-full relative">
                    <thead className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_var(--border)]">
                      <tr>
                        <th className="w-12 text-center bg-card">
                          <input
                            type="checkbox"
                            className="rounded border-border bg-transparent"
                            aria-label={t('adminCatalog.selectAllMissing')}
                            checked={allVisibleSelected}
                            onChange={(e) => toggleAllVisible(e.target.checked)}
                          />
                        </th>
                        <th className="bg-card">{t('adminCatalog.providerTicker')}</th>
                        <th className="bg-card">{t('adminCatalog.assetName')}</th>
                        <th className="bg-card">{t('adminCatalog.networkName')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-12 text-muted-foreground">
                            {searchTerm ? t('selectors.noOptions') : t('adminCatalog.noMissingAssets')}
                          </td>
                        </tr>
                      ) : (
                        paginatedCandidates.map((candidate) => {
                          const isSelected = selectedTickers.has(candidate.providerTicker);
                          return (
                            <tr key={candidate.providerTicker} className={isSelected ? 'bg-primary/5' : undefined}>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="rounded border-border bg-transparent"
                                  aria-label={t('adminCatalog.selectAsset', { asset: candidate.providerTicker })}
                                  checked={isSelected}
                                  onChange={(e) => toggleTicker(candidate.providerTicker, e.target.checked)}
                                />
                              </td>
                              <td className="font-mono text-sm">
                                <strong>{candidate.providerTicker}</strong>
                                {candidate.normalizedTicker !== candidate.providerTicker && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {candidate.normalizedTicker}
                                  </div>
                                )}
                              </td>
                              <td>
                                {candidate.name}
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {t('adminCatalog.assetDecimals', { count: candidate.precision })}
                                </div>
                              </td>
                              <td>
                                {candidate.networks.length > 0 ? (
                                  <div className="flex flex-col gap-2 my-1">
                                    {candidate.networks.map((net, idx) => (
                                      <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{net.providerNetwork}</span>
                                        {net.canDeposit && <span className="text-emerald-500 font-medium px-1 bg-emerald-500/10 rounded">{t('adminCatalog.depositEnabled')}</span>}
                                        {net.canWithdraw && <span className="text-blue-500 font-medium px-1 bg-blue-500/10 rounded">{t('adminCatalog.withdrawEnabled')}</span>}
                                        {net.requiresMemo && <span className="text-amber-500 font-medium px-1 bg-amber-500/10 rounded">{t('adminCatalog.requiresMemo')}</span>}
                                        {net.confirmations != null && (
                                          <span className="text-muted-foreground">{t('adminCatalog.confirmations', { count: net.confirmations })}</span>
                                        )}
                                        <span className={`basis-full font-medium ${net.canDeposit ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                          WhiteBIT deposit support: {net.canDeposit ? 'Supported' : 'Not supported'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs italic">{t('adminCatalog.noNetworks')}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {previewQuery.data && !importMutation.isSuccess && (
          <div className="p-4 border-t border-border bg-muted/10 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {selectedTickers.size > 0
                ? t('adminCatalog.selectedCount', { count: selectedTickers.size })
                : t('adminCatalog.noneSelected')}
            </div>
            {importMutation.isError && (
              <div className="text-sm text-destructive" role="alert">
                {t('adminCatalog.importFailed')}
              </div>
            )}
            
            {filteredCandidates.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <button 
                    className="button button-outline px-2 h-8"
                    disabled={clampedPage <= 1}
                    onClick={() => setPage(p => p - 1)}
                    aria-label={t('genericUi.previous')}
                  >
                    {t('genericUi.previous')}
                  </button>
                  <span className="text-sm text-muted-foreground px-2">
                    {clampedPage} / {totalPages}
                  </span>
                  <button 
                    className="button button-outline px-2 h-8"
                    disabled={clampedPage >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    aria-label={t('genericUi.next')}
                  >
                    {t('genericUi.next')}
                  </button>
                </div>
                
                <button
                  className="button button-primary"
                  disabled={selectedTickers.size === 0 || importMutation.isPending}
                  onClick={handleImport}
                >
                  {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {importMutation.isPending ? t('adminCatalog.importing') : t('adminCatalog.importSelected')}
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
