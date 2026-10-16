import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react';
import { getGameLogoUrl } from '../../api/daemonApi';
import type { GamePackInfo } from '../../types/daemon';
import { resolveLocalized } from '../../utils/localized';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { PackCard, PackLogo, type PackDetail } from './PackCard';

interface InstalledPackCardProps {
  pack: GamePackInfo;
  isBusy: boolean;
  isToggling: boolean;
  onToggle: (packId: string, enabled: boolean) => void;
  onUninstall: (packId: string) => void;
  onTrust: (packId: string) => void;
}

export const InstalledPackCard: React.FC<InstalledPackCardProps> = ({
  pack,
  isBusy,
  isToggling,
  onToggle,
  onUninstall,
  onTrust
}) => {
  const { t, i18n } = useTranslation();
  const packId = pack.id;
  const description = resolveLocalized(pack.description ?? undefined, i18n.language);
  const category = pack.category ? t(`packs.category.${pack.category}`, { defaultValue: pack.category }) : null;

  const details: PackDetail[] = [
    { label: t('packs.detail_id'), value: <code className="font-mono">{packId ?? pack.dir}</code> },
    ...(pack.version ? [{ label: t('packs.detail_version'), value: `v${pack.version}` }] : []),
    ...(category ? [{ label: t('packs.detail_category'), value: category }] : []),
    { label: t('packs.detail_folder'), value: <code className="font-mono text-[11px]">{pack.dir}</code> },
    ...(description ? [{ label: t('packs.detail_description'), value: description }] : [])
  ];

  return (
    <PackCard
      logo={<PackLogo src={packId && pack.loaded ? getGameLogoUrl(packId) : null} />}
      name={pack.name ?? pack.dir}
      version={pack.version}
      author={pack.author}
      meta={category ? [category] : []}
      description={description}
      details={details}
      badges={
        <>
          {pack.loaded ? (
            <Badge variant="success">{t('packs.loaded')}</Badge>
          ) : pack.enabled === false ? (
            <Badge variant="neutral">{t('packs.disabled')}</Badge>
          ) : (
            <Badge variant="danger">{t('packs.invalid')}</Badge>
          )}
          {pack.hasCode && (
            <Badge variant={pack.trusted ? 'accent' : 'warning'}>
              {pack.trusted ? t('packs.code_trusted') : t('packs.code_untrusted')}
            </Badge>
          )}
        </>
      }
      actions={
        packId && (
          <>
            {(pack.loaded || pack.enabled === false) && (
              <Switch
                checked={pack.enabled !== false}
                busy={isToggling}
                disabled={isBusy}
                ariaLabel={pack.enabled === false ? t('packs.enable') : t('packs.disable')}
                title={pack.enabled === false ? t('packs.enable') : t('packs.disable')}
                onCheckedChange={(next) => onToggle(packId, next)}
              />
            )}
            <button
              type="button"
              aria-label={t('packs.uninstall')}
              title={t('packs.uninstall')}
              className="cursor-pointer rounded-[4px] p-1 text-mute hover:bg-surface-3 hover:text-danger-fg"
              onClick={() => onUninstall(packId)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )
      }
      footer={
        <>
          {pack.errors.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-danger-fg">
              {pack.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {pack.hasCode && !pack.trusted && packId && (
            <div className="flex items-start gap-3 rounded-[6px] border border-warning bg-warning-soft p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-2 text-[12px]">
                <p className="leading-relaxed text-soft">{t('packs.trust_warning')}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={isBusy}
                  leadingIcon={<ShieldCheck className="h-3.5 w-3.5" />}
                  onClick={() => onTrust(packId)}
                >
                  {t('packs.trust_button')}
                </Button>
              </div>
            </div>
          )}
        </>
      }
    />
  );
};
