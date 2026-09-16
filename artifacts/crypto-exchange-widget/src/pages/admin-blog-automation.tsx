import { useState, useEffect, useRef } from 'react';
import { 
  useGetAdminBlogSettings, 
  useUpdateAdminBlogSettings,
  useListAdminBlogSources,
  useCreateAdminBlogSource,
  useUpdateAdminBlogSource,
  useDeleteAdminBlogSource,
  useRunBlogAutomation,
  usePreviewBlogAutomation,
  getGetAdminBlogSettingsQueryKey,
  getListAdminBlogSourcesQueryKey
} from '@workspace/api-client-react';
import { AdminShell } from '@/App';
import { cn, LoadingBlock, InlineNotice } from '@/components/shared-app-ui';
import { Save, Edit2, Trash2, Settings, Zap, Eye, Loader2, Play } from 'lucide-react';
import { queryClient } from '@/App';
import type { 
  BlogAutomationSourceInput, 
  BlogAutomationSettingsInput 
} from '@workspace/api-client-react';
import { useAdminPermissions } from '@/lib/admin-permissions';

export function AdminBlogAutomationPage() {
  const { can } = useAdminPermissions();
  const canManage = can('blog.manage');
  const settingsQuery = useGetAdminBlogSettings({ query: { queryKey: getGetAdminBlogSettingsQueryKey() } });
  const updateSettings = useUpdateAdminBlogSettings();
  
  const sourcesQuery = useListAdminBlogSources({ query: { queryKey: getListAdminBlogSourcesQueryKey() } });
  const createSource = useCreateAdminBlogSource();
  const updateSource = useUpdateAdminBlogSource();
  const deleteSource = useDeleteAdminBlogSource();
  
  const runAutomation = useRunBlogAutomation();
  const previewAutomation = usePreviewBlogAutomation();

  const [settingsNotice, setSettingsNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [sourcesNotice, setSourcesNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);

  const [settingsForm, setSettingsForm] = useState<Partial<BlogAutomationSettingsInput>>({});
  const [scheduleTimesStr, setScheduleTimesStr] = useState('');
  const [topicsStr, setTopicsStr] = useState('');
  const [categoriesStr, setCategoriesStr] = useState('');
  const [keywordsStr, setKeywordsStr] = useState('');
  const initSettingsRef = useRef(false);

  useEffect(() => {
    if (settingsQuery.data && !initSettingsRef.current) {
      setSettingsForm(settingsQuery.data as any);
      setScheduleTimesStr((settingsQuery.data.scheduleTimes || []).join(', '));
      setTopicsStr((settingsQuery.data.topics || []).join(', '));
      setCategoriesStr((settingsQuery.data.categories || []).join(', '));
      setKeywordsStr((settingsQuery.data.keywords || []).join(', '));
      initSettingsRef.current = true;
    }
  }, [settingsQuery.data]);

  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState<Partial<BlogAutomationSourceInput>>({
    name: '',
    url: '',
    sourceType: 'rss',
    reliability: 'standard',
    enabled: true
  });

  if (!canManage) {
    return <AdminShell title="Blog Automation" eyebrow="Content" requiredPermission="blog.manage">{null}</AdminShell>;
  }

  const handleSaveSettings = () => {
    if (!settingsQuery.data) return;
    
    const payload: BlogAutomationSettingsInput = {
      ...settingsForm,
      scheduleTimes: scheduleTimesStr.split(',').map(s => s.trim()).filter(Boolean),
      topics: topicsStr.split(',').map(s => s.trim()).filter(Boolean),
      categories: categoriesStr.split(',').map(s => s.trim()).filter(Boolean),
      keywords: keywordsStr.split(',').map(s => s.trim()).filter(Boolean),
    };
    
    updateSettings.mutate({ 
      data: payload 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminBlogSettingsQueryKey() });
        setSettingsNotice({ kind: 'success', text: 'Settings updated successfully' });
        setTimeout(() => setSettingsNotice(null), 3000);
      },
      onError: () => setSettingsNotice({ kind: 'error', text: 'Failed to update settings' })
    });
  };

  const resetSourceForm = () => {
    setEditingSourceId(null);
    setSourceForm({
      name: '',
      url: '',
      sourceType: 'rss',
      reliability: 'standard',
      enabled: true
    });
  };

  const handleEditSource = (source: any) => {
    setEditingSourceId(source.id);
    setSourceForm({
      name: source.name,
      url: source.url,
      sourceType: source.sourceType,
      reliability: source.reliability,
      enabled: source.enabled
    });
  };

  const handleSaveSource = () => {
    if (!sourceForm.name || !sourceForm.url) {
      setSourcesNotice({ kind: 'error', text: 'Name and URL are required' });
      return;
    }

    const payload = sourceForm as BlogAutomationSourceInput;

    if (editingSourceId) {
      updateSource.mutate({ id: editingSourceId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminBlogSourcesQueryKey() });
          setSourcesNotice({ kind: 'success', text: 'Source updated' });
          resetSourceForm();
        },
        onError: () => setSourcesNotice({ kind: 'error', text: 'Failed to update source' })
      });
    } else {
      createSource.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminBlogSourcesQueryKey() });
          setSourcesNotice({ kind: 'success', text: 'Source added' });
          resetSourceForm();
        },
        onError: () => setSourcesNotice({ kind: 'error', text: 'Failed to add source' })
      });
    }
  };

  const handleDeleteSource = (id: string) => {
    if (!window.confirm('Remove this source?')) return;
    
    deleteSource.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminBlogSourcesQueryKey() });
        setSourcesNotice({ kind: 'success', text: 'Source removed' });
      },
      onError: () => setSourcesNotice({ kind: 'error', text: 'Failed to remove source' })
    });
  };

  const handleRunAutomation = () => {
    if (!window.confirm('Run the blog automation now? This will fetch new articles based on your sources and settings.')) return;
    
    runAutomation.mutate({ data: {} }, {
      onSuccess: (result) => {
        alert(`Automation run complete. Status: ${result.status}`);
      },
      onError: () => alert('Failed to run automation')
    });
  };

  const handlePreviewAutomation = () => {
    previewAutomation.mutate(undefined, {
      onSuccess: (result) => {
        setPreviewResult(result);
      },
      onError: () => alert('Failed to preview automation')
    });
  };

  return (
    <AdminShell title="Blog Automation" eyebrow="Content" requiredPermission="blog.manage">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Sources Management */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Zap size={18} className="text-primary" />
                Automation Sources
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure RSS feeds and other sources for automated content generation.
              </p>
              
              {sourcesNotice && (
                <div className="mt-4">
                  <InlineNotice kind={sourcesNotice.kind}>{sourcesNotice.text}</InlineNotice>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-muted/20 border-b border-border">
              <h3 className="text-sm font-bold mb-4">{editingSourceId ? 'Edit Source' : 'Add New Source'}</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Name</label>
                  <input 
                    className="admin-input text-sm w-full" 
                    placeholder="Source name"
                    value={sourceForm.name || ''}
                    onChange={(e) => setSourceForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">URL</label>
                  <input 
                    className="admin-input text-sm w-full" 
                    placeholder="https://..."
                    value={sourceForm.url || ''}
                    onChange={(e) => setSourceForm(prev => ({ ...prev, url: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Source Type</label>
                  <select 
                    className="admin-input text-sm w-full"
                    value={sourceForm.sourceType || 'rss'}
                    onChange={(e) => setSourceForm(prev => ({ ...prev, sourceType: e.target.value as any }))}
                  >
                    <option value="rss">RSS</option>
                    <option value="atom">Atom</option>
                    <option value="coinmarketcap">CoinMarketCap</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Reliability</label>
                  <select 
                    className="admin-input text-sm w-full"
                    value={sourceForm.reliability || 'standard'}
                    onChange={(e) => setSourceForm(prev => ({ ...prev, reliability: e.target.value as any }))}
                  >
                    <option value="standard">Standard</option>
                    <option value="reliable">Reliable</option>
                    <option value="official">Official</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input 
                      type="checkbox" 
                      checked={sourceForm.enabled !== false} 
                      onChange={(e) => setSourceForm(prev => ({ ...prev, enabled: e.target.checked }))}
                    />
                    Enabled
                  </label>
                  <div className="flex gap-2">
                    {editingSourceId && (
                      <button className="button button-secondary" onClick={resetSourceForm}>Cancel</button>
                    )}
                    <button 
                      className="button button-primary" 
                      onClick={handleSaveSource}
                      disabled={createSource.isPending || updateSource.isPending}
                    >
                      {editingSourceId ? 'Update Source' : 'Add Source'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-0">
              {sourcesQuery.isLoading ? (
                <LoadingBlock rows={3} />
              ) : sourcesQuery.data?.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  No sources configured yet.
                </div>
              ) : (
                <table className="admin-table w-full m-0">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourcesQuery.data?.map((source: any) => (
                      <tr key={source.id}>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-bold">{source.name}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={source.url}>{source.url}</span>
                          </div>
                        </td>
                        <td>
                          <span className="px-2 py-0.5 rounded text-xs uppercase bg-muted text-muted-foreground font-semibold">
                            {source.sourceType}
                          </span>
                        </td>
                        <td>
                          <span className={cn("px-2 py-0.5 rounded text-xs uppercase font-semibold", source.enabled ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")}>
                            {source.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="text-right">
                          <button className="icon-button mr-1" onClick={() => handleEditSource(source)} title="Edit">
                            <Edit2 size={14} />
                          </button>
                          <button className="icon-button text-destructive" onClick={() => handleDeleteSource(source.id)} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Preview / Run */}
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Play size={18} className="text-primary" />
                Run & Preview
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Preview what the automation would generate right now, or trigger a manual run to fetch new content immediately.
            </p>
            <div className="flex gap-4">
              <button 
                className="button button-secondary"
                onClick={handlePreviewAutomation}
                disabled={previewAutomation.isPending}
                data-testid="button-preview-automation"
              >
                {previewAutomation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Eye size={16} className="mr-2" />}
                Preview Run
              </button>
              <button 
                className="button button-primary"
                onClick={handleRunAutomation}
                disabled={runAutomation.isPending}
                data-testid="button-run-automation"
              >
                {runAutomation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Zap size={16} className="mr-2" />}
                Run Now
              </button>
            </div>

            {previewResult && (
              <div className="mt-6 bg-muted/30 border border-border rounded-lg p-4">
                <h3 className="text-sm font-bold mb-2">Preview Result</h3>
                <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-64">
                  {JSON.stringify(previewResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Global Settings */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b border-border/50 pb-4">
              <Settings size={18} className="text-muted-foreground" />
              Automation Settings
            </h2>

            {settingsNotice && (
              <InlineNotice kind={settingsNotice.kind}>{settingsNotice.text}</InlineNotice>
            )}

            {settingsQuery.isLoading ? (
              <LoadingBlock rows={4} />
            ) : settingsQuery.data ? (
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="mt-0.5">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4"
                      checked={settingsForm.enabled} 
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, enabled: e.target.checked }))}
                      data-testid="setting-enabled"
                    />
                  </div>
                  <div>
                    <span className="block font-bold text-sm">Enable Automation</span>
                    <span className="text-xs text-muted-foreground">Run automation on a schedule</span>
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Cadence Unit</label>
                    <select 
                      className="admin-input text-sm w-full"
                      value={settingsForm.cadenceUnit || 'day'}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, cadenceUnit: e.target.value as any }))}
                      data-testid="setting-cadence-unit"
                    >
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Articles Per Period</label>
                    <input 
                      type="number" 
                      className="admin-input text-sm w-full" 
                      value={settingsForm.articlesPerPeriod || 1}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, articlesPerPeriod: parseInt(e.target.value, 10) }))}
                      data-testid="setting-articles-per-period"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Timezone</label>
                    <input 
                      className="admin-input text-sm w-full" 
                      placeholder="UTC, America/New_York..."
                      value={settingsForm.timezone || ''}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, timezone: e.target.value }))}
                      data-testid="setting-timezone"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Schedule Times</label>
                    <input 
                      className="admin-input text-sm w-full" 
                      placeholder="09:00, 15:30"
                      value={scheduleTimesStr}
                      onChange={(e) => setScheduleTimesStr(e.target.value)}
                      data-testid="setting-schedule-times"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Publication Mode</label>
                  <select 
                    className="admin-input text-sm w-full"
                    value={settingsForm.publicationMode || 'draft'}
                    onChange={(e) => setSettingsForm(prev => ({ ...prev, publicationMode: e.target.value as any }))}
                    data-testid="setting-publication-mode"
                  >
                    <option value="draft">Draft (Requires manual publish)</option>
                    <option value="review">Review</option>
                    <option value="auto">Auto (Publish immediately)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Topics (comma-separated)</label>
                  <input 
                    className="admin-input text-sm w-full" 
                    value={topicsStr}
                    onChange={(e) => setTopicsStr(e.target.value)}
                    data-testid="setting-topics"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Categories (comma-separated)</label>
                  <input 
                    className="admin-input text-sm w-full" 
                    value={categoriesStr}
                    onChange={(e) => setCategoriesStr(e.target.value)}
                    data-testid="setting-categories"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Keywords (comma-separated)</label>
                  <input 
                    className="admin-input text-sm w-full" 
                    value={keywordsStr}
                    onChange={(e) => setKeywordsStr(e.target.value)}
                    data-testid="setting-keywords"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Language</label>
                    <input 
                      className="admin-input text-sm w-full" 
                      placeholder="en, fr..."
                      value={settingsForm.language || 'en'}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, language: e.target.value }))}
                      data-testid="setting-language"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Min Length</label>
                    <input 
                      type="number" 
                      className="admin-input text-sm w-full" 
                      value={settingsForm.minimumArticleLength || 1000}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, minimumArticleLength: parseInt(e.target.value, 10) }))}
                      data-testid="setting-min-length"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 mt-0.5"
                      checked={settingsForm.requireTwoSources} 
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, requireTwoSources: e.target.checked }))}
                      data-testid="setting-two-sources"
                    />
                    <div>
                      <span className="block font-bold text-sm">Require Multiple Sources</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 mt-0.5"
                      checked={settingsForm.featuredImageGeneration} 
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, featuredImageGeneration: e.target.checked }))}
                      data-testid="setting-image-gen"
                    />
                    <div>
                      <span className="block font-bold text-sm">Generate Featured Image</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 mt-0.5"
                      checked={settingsForm.seoGeneration} 
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, seoGeneration: e.target.checked }))}
                      data-testid="setting-seo-gen"
                    />
                    <div>
                      <span className="block font-bold text-sm">Generate SEO Meta</span>
                    </div>
                  </label>
                </div>
                
                <div className="pt-4 border-t border-border/50">
                  <button 
                    className="button button-primary w-full" 
                    onClick={handleSaveSettings}
                    disabled={updateSettings.isPending}
                    data-testid="button-save-settings"
                  >
                    {updateSettings.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                    Save Settings
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
