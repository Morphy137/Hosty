import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Download, ExternalLink, Loader2, Search } from 'lucide-react';
import {
  fetchCatalogFacets,
  fetchCatalogVersions,
  getCatalogIconUrl,
  installCatalogMod,
  searchCatalogMods,
  toErrorPayload
} from '../../api/daemonApi';
import type {
  CatalogFilters,
  ModFacets,
  ModSearchHit,
  ModSourceInfo,
  ModVersionInfo
} from '../../types/daemon';
import { cn } from '../../utils/cn';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useToast } from '../ui/toastContext';

interface ModCatalogDialogProps {
  open: boolean;
  onClose: () => void;
  instanceId: string;
  sources: ModSourceInfo[];
  /** Called after a file was added so the mod list can refresh. */
  onInstalled: () => void;
}

const SERVER_DEFAULT = 'instance';
const ANY = 'any';
/** Radix Select cannot hold an empty value, so "catalog default" sort gets its own option value. */
const SORT_DEFAULT = 'default';

const DEFAULT_FILTERS: CatalogFilters = {
  sort: '',
  loader: SERVER_DEFAULT,
  gameVersion: SERVER_DEFAULT,
  environment: '',
  categories: []
};

type FacetsState = ModFacets & { instance: { loader: string | null; gameVersion: string | null } };

const compact = (value: number): string => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);
const prettify = (id: string): string => id.replace(/[-_]/g, ' ').replace(/^./, (char) => char.toUpperCase());

/** Mod browser with the filters people expect from the catalog's own site; sources come from the driver. */
export const ModCatalogDialog: React.FC<ModCatalogDialogProps> = ({
  open,
  onClose,
  instanceId,
  sources,
  onInstalled
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [facets, setFacets] = useState<FacetsState | null>(null);
  const [hits, setHits] = useState<ModSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, ModVersionInfo[] | 'loading' | 'error'>>({});

  const source = sources.find((candidate) => candidate.id === sourceId) ?? sources[0];
  const latestRequest = useRef(0);

  // Filters (sort, categories...) depend on the catalog, loaded once per source.
  useEffect(() => {
    if (!open || !source) return;
    let ignore = false;
    fetchCatalogFacets(instanceId, source.id)
      .then((result) => {
        if (!ignore) setFacets(result);
      })
      .catch(() => {
        // Filters are optional: searching still works without them.
      });
    return () => {
      ignore = true;
    };
  }, [open, instanceId, source]);

  const runSearch = useCallback(
    async (text: string, offset: number, activeFilters: CatalogFilters) => {
      if (!source) return;
      const requestId = ++latestRequest.current;
      setIsSearching(true);
      setError(null);
      try {
        const result = await searchCatalogMods(instanceId, source.id, text, offset, activeFilters);
        if (requestId !== latestRequest.current) return;
        setHits((current) => (offset > 0 ? [...current, ...result.hits] : result.hits));
        setTotal(result.total);
        if (offset === 0) {
          setExpanded(null);
          setVersions({});
        }
      } catch (err) {
        if (requestId !== latestRequest.current) return;
        const payload = toErrorPayload(err);
        setError(t(`errors.${payload.code}`, { defaultValue: payload.message }));
      } finally {
        if (requestId === latestRequest.current) setIsSearching(false);
      }
    },
    [instanceId, source, t]
  );

  // Search as you type (debounced); filter changes apply immediately.
  useEffect(() => {
    if (!open) return;
    const delay = query.trim() ? 350 : 0;
    const timer = window.setTimeout(() => void runSearch(query.trim(), 0, filters), delay);
    return () => window.clearTimeout(timer);
  }, [open, query, filters, runSearch]);

  const patchFilters = (patch: Partial<CatalogFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const toggleCategory = (id: string) =>
    patchFilters({
      categories: filters.categories.includes(id)
        ? filters.categories.filter((entry) => entry !== id)
        : [...filters.categories, id]
    });

  const hasActiveFilters =
    filters.sort !== '' ||
    filters.loader !== SERVER_DEFAULT ||
    filters.gameVersion !== SERVER_DEFAULT ||
    filters.environment !== '' ||
    filters.categories.length > 0;

  const toggleVersions = async (hit: ModSearchHit) => {
    if (expanded === hit.projectId) {
      setExpanded(null);
      return;
    }
    setExpanded(hit.projectId);
    if (!source || Array.isArray(versions[hit.projectId])) return;
    setVersions((current) => ({ ...current, [hit.projectId]: 'loading' }));
    try {
      const result = await fetchCatalogVersions(instanceId, source.id, hit.projectId, filters);
      setVersions((current) => ({ ...current, [hit.projectId]: result }));
    } catch {
      setVersions((current) => ({ ...current, [hit.projectId]: 'error' }));
    }
  };

  const handleInstall = async (hit: ModSearchHit, version?: ModVersionInfo) => {
    if (!source) return;
    const key = version ? version.id : hit.projectId;
    setInstalling(key);
    try {
      const result = await installCatalogMod(instanceId, source.id, hit.projectId, version?.id);
      toast({
        title: t('mod_catalog.installed', { name: hit.title }),
        description: result.restartRequired ? t('mod_catalog.restart_required') : result.filename,
        variant: 'success'
      });
      onInstalled();
    } catch (err) {
      const payload = toErrorPayload(err);
      toast({
        title: t('mod_catalog.install_failed', { name: hit.title }),
        description: t(`errors.${payload.code}`, { defaultValue: payload.message }),
        variant: 'error'
      });
    } finally {
      setInstalling(null);
    }
  };

  const formatDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso)) : '';

  const sortOptions = useMemo(
    () => [
      { value: SORT_DEFAULT, label: t('mod_catalog.sort_default') },
      ...(facets?.sorts ?? ['relevance', 'downloads', 'follows', 'newest', 'updated']).map((sort) => ({
        value: sort,
        label: t(`mod_catalog.sort.${sort}`)
      }))
    ],
    [facets, t]
  );

  const loaderOptions = useMemo(
    () => [
      {
        value: SERVER_DEFAULT,
        label: facets?.instance.loader
          ? t('mod_catalog.server_default', { value: prettify(facets.instance.loader) })
          : t('mod_catalog.any')
      },
      { value: ANY, label: t('mod_catalog.any') },
      ...(facets?.loaders ?? []).map((loader) => ({ value: loader, label: prettify(loader) }))
    ],
    [facets, t]
  );

  const versionOptions = useMemo(
    () => [
      {
        value: SERVER_DEFAULT,
        label: facets?.instance.gameVersion
          ? t('mod_catalog.server_default', { value: facets.instance.gameVersion })
          : t('mod_catalog.any')
      },
      { value: ANY, label: t('mod_catalog.any') },
      ...(facets?.gameVersions ?? []).map((version) => ({ value: version, label: version }))
    ],
    [facets, t]
  );

  const environmentOptions: Array<{ value: CatalogFilters['environment']; label: string }> = [
    { value: '', label: t('mod_catalog.env_any') },
    { value: 'server', label: t('mod_catalog.env_server') },
    { value: 'client', label: t('mod_catalog.env_client') }
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="xl"
      height="fixed"
      title={t('mod_catalog.title')}
      description={t('mod_catalog.description', { source: source?.name ?? '' })}
    >
      <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] gap-4">
        {/* Filters */}
        <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase text-mute">{t('mod_catalog.filters')}</span>
            {hasActiveFilters && (
              <button
                type="button"
                className="cursor-pointer text-[11px] text-accent-fg hover:underline"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                {t('mod_catalog.reset')}
              </button>
            )}
          </div>

          {sources.length > 1 && (
            <Select
              ariaLabel={t('mod_catalog.source')}
              value={sourceId}
              onValueChange={setSourceId}
              options={sources.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            />
          )}

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-ink">{t('mod_catalog.sort_label')}</span>
            <Select
              ariaLabel={t('mod_catalog.sort_label')}
              value={filters.sort || SORT_DEFAULT}
              onValueChange={(value) =>
                patchFilters({ sort: (value === SORT_DEFAULT ? '' : value) as CatalogFilters['sort'] })
              }
              options={sortOptions}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-ink">{t('mod_catalog.loader')}</span>
            <Select
              ariaLabel={t('mod_catalog.loader')}
              value={filters.loader}
              onValueChange={(value) => patchFilters({ loader: value })}
              options={loaderOptions}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-ink">{t('mod_catalog.game_version')}</span>
            <Select
              ariaLabel={t('mod_catalog.game_version')}
              value={filters.gameVersion}
              onValueChange={(value) => patchFilters({ gameVersion: value })}
              options={versionOptions}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-ink">{t('mod_catalog.environment')}</span>
            <div className="flex flex-wrap gap-1.5">
              {environmentOptions.map((option) => (
                <button
                  key={option.value || 'any'}
                  type="button"
                  onClick={() => patchFilters({ environment: option.value })}
                  className={cn(
                    'h-7 cursor-pointer rounded-[6px] border px-2.5 text-[11px] font-medium transition-colors',
                    filters.environment === option.value
                      ? 'border-ink bg-ink text-on-ink'
                      : 'border-hairline bg-surface text-body hover:bg-surface-3'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {(facets?.categories.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-ink">{t('mod_catalog.categories')}</span>
              <div className="space-y-1">
                {facets?.categories.map((category) => (
                  <label key={category.id} className="flex cursor-pointer items-center gap-2 text-[12px] text-body">
                    <input
                      type="checkbox"
                      checked={filters.categories.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                    />
                    {prettify(category.name)}
                  </label>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Results */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <Input
              autoFocus
              value={query}
              className="pl-9"
              placeholder={t('mod_catalog.search_placeholder')}
              onChange={(event) => setQuery(event.target.value)}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-mute" />
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between text-[11px] text-mute">
            <span>{t('mod_catalog.results', { count: total })}</span>
          </div>

          {error && <p className="shrink-0 text-[12px] text-danger-fg">{error}</p>}

          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {hits.length === 0 && !isSearching && !error && (
              <li className="py-8 text-center text-[13px] text-mute">{t('mod_catalog.empty')}</li>
            )}
            {hits.map((hit) => {
              const versionState = versions[hit.projectId];
              const isOpen = expanded === hit.projectId;
              return (
                <li key={hit.projectId} className="rounded-[8px] border border-hairline bg-surface-2">
                  <div className="flex items-start gap-3 p-3">
                    {hit.iconUrl ? (
                      <img
                        src={source ? getCatalogIconUrl(instanceId, source.id, hit.iconUrl) : hit.iconUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-[8px] bg-surface-3 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-[8px] bg-surface-3" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[14px] font-semibold text-ink">{hit.title}</span>
                        <span className="text-[11px] text-mute">{t('mod_catalog.by', { author: hit.author })}</span>
                      </div>
                      <p className="line-clamp-2 text-[12px] leading-relaxed text-soft">{hit.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hit.categories.slice(0, 4).map((category) => (
                          <Badge key={category} variant="neutral">
                            {prettify(category)}
                          </Badge>
                        ))}
                        <span className="font-mono text-[11px] text-mute">
                          {compact(hit.downloads)} {t('mod_catalog.downloads')}
                          {hit.updatedAt ? ` · ${t('mod_catalog.updated', { date: formatDate(hit.updatedAt) })}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={installing !== null}
                        leadingIcon={
                          installing === hit.projectId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )
                        }
                        onClick={() => void handleInstall(hit)}
                      >
                        {t('mod_catalog.install_latest')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void toggleVersions(hit)}
                        leadingIcon={
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                        }
                      >
                        {t('mod_catalog.versions')}
                      </Button>
                      {hit.url && (
                        <a
                          href={hit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 text-[11px] font-medium text-ink no-underline hover:bg-surface-3"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('mod_catalog.open_page')}
                        </a>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-hairline bg-surface p-2">
                      {versionState === 'loading' && (
                        <div className="flex items-center gap-2 p-2 text-[12px] text-mute">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t('mod_catalog.loading_versions')}
                        </div>
                      )}
                      {versionState === 'error' && (
                        <p className="p-2 text-[12px] text-danger-fg">{t('mod_catalog.versions_failed')}</p>
                      )}
                      {Array.isArray(versionState) && versionState.length === 0 && (
                        <p className="p-2 text-[12px] text-mute">{t('mod_catalog.no_versions')}</p>
                      )}
                      {Array.isArray(versionState) && versionState.length > 0 && (
                        <ul className="max-h-64 divide-y divide-hairline overflow-y-auto">
                          {versionState.map((version) => (
                            <li key={version.id} className="flex items-center gap-3 px-2 py-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-[12px] font-medium text-ink">{version.name}</span>
                                  <Badge
                                    variant={
                                      version.type === 'release' ? 'success' : version.type === 'beta' ? 'warning' : 'danger'
                                    }
                                  >
                                    {t(`mod_catalog.type.${version.type}`)}
                                  </Badge>
                                </div>
                                <div className="truncate font-mono text-[11px] text-mute">
                                  {version.gameVersions.slice(0, 4).join(', ')}
                                  {version.gameVersions.length > 4 ? ` +${version.gameVersions.length - 4}` : ''}
                                  {' · '}
                                  {version.loaders.map(prettify).join(', ')}
                                  {version.publishedAt ? ` · ${formatDate(version.publishedAt)}` : ''}
                                  {version.filename ? ` · ${version.filename}` : ''}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={installing !== null}
                                leadingIcon={
                                  installing === version.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )
                                }
                                onClick={() => void handleInstall(hit, version)}
                              >
                                {t('mod_catalog.install')}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {hits.length > 0 && hits.length < total && (
              <li className="flex justify-center pt-1">
                <Button
                  variant="secondary"
                  loading={isSearching}
                  onClick={() => void runSearch(query.trim(), hits.length, filters)}
                >
                  {t('mod_catalog.load_more')}
                </Button>
              </li>
            )}
          </ul>
        </section>
      </div>
    </Dialog>
  );
};
