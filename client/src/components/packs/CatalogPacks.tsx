import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchCatalog, installCatalogPack } from '../../api/daemonApi';
import type { CatalogPack, GamePackInfo } from '../../types/daemon';
import { formatBytes } from '../../utils/format';
import { resolveLocalized } from '../../utils/localized';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { PackCard, PackLogo, type PackDetail } from './PackCard';

const PLACEHOLDER_ROWS = 3;

interface CatalogPacksProps {
  /** Called with the installed packs after an install or update, so the rest of the app refreshes. */
  onInstalled: (packs: GamePackInfo[]) => void;
  /** Bump to refetch the catalog (for example after installing or removing a pack elsewhere). */
  refreshKey: number;
}

/** Browse the signed game catalog and install or update packs from it. */
export const CatalogPacks: React.FC<CatalogPacksProps> = ({ onInstalled, refreshKey }) => {
  const { t, i18n } = useTranslation();
  const [packs, setPacks] = useState<CatalogPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPacks((await fetchCatalog()).packs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPacks((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect itself never sets state synchronously.
    void Promise.resolve().then(load);
  }, [load, refreshKey]);

  const install = async (pack: CatalogPack) => {
    setInstallingId(pack.id);
    setError(null);
    try {
      const result = await installCatalogPack(pack.id);
      onInstalled(result.packs);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingId(null);
    }
  };

  if (packs === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-[68px] rounded-[10px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-[12px] text-soft">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-fg" />
        <span>{t('packs.catalog_hint')}</span>
      </p>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-[8px] border border-hairline bg-surface-2 p-3 text-[12px]">
          <span className="text-danger-fg">{error}</span>
          <Button size="sm" variant="secondary" leadingIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            {t('packs.catalog_retry')}
          </Button>
        </div>
      )}
      {!error && packs.length === 0 && <p className="text-[13px] text-mute">{t('packs.catalog_empty')}</p>}

      <ul className="space-y-2">
        {packs.map((pack) => {
          const description = resolveLocalized(pack.description ?? undefined, i18n.language);
          const category = pack.category ? t(`packs.category.${pack.category}`, { defaultValue: pack.category }) : null;
          const size = formatBytes(pack.size);
          const isInstalled = pack.installedVersion !== null;
          const details: PackDetail[] = [
            { label: t('packs.detail_id'), value: <code className="font-mono">{pack.id}</code> },
            { label: t('packs.detail_version'), value: `v${pack.version}` },
            ...(isInstalled ? [{ label: t('packs.detail_installed'), value: `v${pack.installedVersion}` }] : []),
            ...(category ? [{ label: t('packs.detail_category'), value: category }] : []),
            { label: t('packs.detail_size'), value: size },
            ...(description ? [{ label: t('packs.detail_description'), value: description }] : [])
          ];

          return (
            <PackCard
              key={pack.id}
              logo={<PackLogo src={pack.logoUrl} />}
              name={pack.name}
              version={pack.version}
              author={pack.author}
              meta={[...(category ? [category] : []), size]}
              description={description}
              details={details}
              badges={
                <>
                  <Badge variant="success" title={t('packs.verified_hint')}>
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {t('packs.verified')}
                  </Badge>
                  {pack.hasCode && <Badge variant="neutral">{t('packs.has_code')}</Badge>}
                </>
              }
              actions={
                isInstalled && !pack.updateAvailable ? (
                  <Badge variant="neutral">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {t('packs.up_to_date')}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={installingId === pack.id}
                    disabled={installingId !== null}
                    leadingIcon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => void install(pack)}
                  >
                    {pack.updateAvailable ? t('packs.update') : t('packs.install_catalog')}
                  </Button>
                )
              }
            />
          );
        })}
      </ul>
    </div>
  );
};
