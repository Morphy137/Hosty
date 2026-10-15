import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Loader2, Search } from 'lucide-react';
import { installCatalogMod, searchCatalogMods } from '../../api/daemonApi';
import { toErrorPayload } from '../../api/daemonApi';
import type { ModSearchHit, ModSourceInfo } from '../../types/daemon';
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

const formatDownloads = (value: number): string =>
  new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value);

/** Generic mod catalog browser: the sources (and their filters) come from the game's driver. */
export const ModCatalogDialog: React.FC<ModCatalogDialogProps> = ({
  open,
  onClose,
  instanceId,
  sources,
  onInstalled
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ModSearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = sources.find((candidate) => candidate.id === sourceId) ?? sources[0];

  const runSearch = useCallback(
    async (text: string, offset: number) => {
      if (!source) return;
      setIsSearching(true);
      setError(null);
      try {
        const result = await searchCatalogMods(instanceId, source.id, text, offset);
        setHits((current) => (offset > 0 ? [...current, ...result.hits] : result.hits));
        setTotal(result.total);
      } catch (err) {
        const payload = toErrorPayload(err);
        setError(t(`errors.${payload.code}`, { defaultValue: payload.message }));
      } finally {
        setIsSearching(false);
      }
    },
    [instanceId, source, t]
  );

  // Show the most popular results as soon as the dialog opens.
  useEffect(() => {
    if (open) void Promise.resolve().then(() => runSearch('', 0));
  }, [open, runSearch]);

  const handleInstall = async (hit: ModSearchHit) => {
    if (!source) return;
    setInstalling(hit.projectId);
    try {
      const result = await installCatalogMod(instanceId, source.id, hit.projectId);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="xl"
      title={t('mod_catalog.title')}
      description={t('mod_catalog.description', { source: source?.name ?? '' })}
    >
      <div className="space-y-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(query.trim(), 0);
          }}
        >
          {sources.length > 1 && (
            <Select
              className="w-[160px] shrink-0"
              ariaLabel={t('mod_catalog.source')}
              value={sourceId}
              onValueChange={setSourceId}
              options={sources.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            />
          )}
          <Input
            autoFocus
            value={query}
            placeholder={t('mod_catalog.search_placeholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="primary" loading={isSearching} leadingIcon={<Search className="h-3.5 w-3.5" />}>
            {t('mod_catalog.search')}
          </Button>
        </form>

        {error && <p className="text-[12px] text-danger-fg">{error}</p>}

        <ul className="max-h-[52vh] min-h-[200px] space-y-2 overflow-y-auto pr-1">
          {hits.length === 0 && !isSearching && !error && (
            <li className="py-8 text-center text-[13px] text-mute">{t('mod_catalog.empty')}</li>
          )}
          {hits.map((hit) => (
            <li key={hit.projectId} className="flex items-start gap-3 rounded-[8px] border border-hairline bg-surface-2 p-3">
              {hit.iconUrl ? (
                <img src={hit.iconUrl} alt="" className="h-10 w-10 shrink-0 rounded-[6px] object-cover" loading="lazy" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-[6px] bg-surface-3" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink">{hit.title}</span>
                  <span className="shrink-0 text-[11px] text-mute">
                    {t('mod_catalog.by', { author: hit.author })} · {formatDownloads(hit.downloads)}
                  </span>
                  {hit.url && (
                    <a href={hit.url} target="_blank" rel="noopener noreferrer" className="text-mute hover:text-ink">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="line-clamp-2 text-[12px] leading-relaxed text-soft">{hit.description}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
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
                {t('mod_catalog.install')}
              </Button>
            </li>
          ))}
          {hits.length > 0 && hits.length < total && (
            <li className="flex justify-center pt-1">
              <Button variant="secondary" loading={isSearching} onClick={() => void runSearch(query.trim(), hits.length)}>
                {t('mod_catalog.load_more')}
              </Button>
            </li>
          )}
        </ul>
      </div>
    </Dialog>
  );
};
