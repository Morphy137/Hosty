import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { createBackup, deleteBackup, fetchBackups, fetchInstallerVersions, installServer, restoreBackup } from '../../api/daemonApi';
import type { BackupInfo, GameDriverSummary } from '../../types/daemon';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useToast } from '../ui/toastContext';

const BYTES_PER_MEGABYTE = 1024 * 1024;

interface BackupsTabProps {
  instanceId: string;
  isRunning: boolean;
  game?: GameDriverSummary;
  currentVariant?: string;
  currentVersion?: string;
}

export const BackupsTab: React.FC<BackupsTabProps> = ({ instanceId, isRunning, game, currentVariant, currentVersion }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const variants = (game?.installer?.variants ?? []).filter((variant) => variant.automatic);
  const [variantId, setVariantId] = useState(currentVariant ?? '');
  const [versions, setVersions] = useState<string[]>([]);
  const [versionId, setVersionId] = useState('');
  const activeVariant = variants.find((variant) => variant.id === variantId) ?? variants[0];

  useEffect(() => {
    if (!game || !activeVariant) return;
    let ignore = false;
    void fetchInstallerVersions(game.id, activeVariant.id).then((list) => {
      if (ignore) return;
      setVersions(list);
      setVersionId(list.includes(currentVersion ?? '') ? (currentVersion as string) : (list[0] ?? ''));
    });
    return () => {
      ignore = true;
    };
  }, [game, activeVariant, currentVersion]);

  const refresh = useCallback(async () => {
    const result = await fetchBackups(instanceId);
    setBackups(result.backups);
  }, [instanceId]);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => setBackups([]));
  }, [refresh]);

  const run = async (operation: () => Promise<unknown>, successKey: string) => {
    setIsBusy(true);
    try {
      await operation();
      await refresh();
      toast({ title: t(successKey), variant: 'success' });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : String(error), variant: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestore = (name: string) => {
    if (window.confirm(t('backups.confirm_restore'))) {
      void run(() => restoreBackup(instanceId, name), 'backups.restored');
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{t('backups.title')}</h2>
          <p className="text-[12px] text-soft">{t('backups.description')}</p>
        </div>
        <Button
          variant="primary"
          loading={isBusy}
          leadingIcon={<Archive className="h-3.5 w-3.5" />}
          onClick={() => void run(() => createBackup(instanceId), 'backups.created')}
        >
          {t('backups.create')}
        </Button>
      </div>

      {activeVariant && versions.length > 0 && (
        <div className="space-y-2 rounded-[8px] border border-hairline bg-surface-2 p-3.5">
          <h3 className="text-[13px] font-semibold text-ink">{t('backups.version_title')}</h3>
          <p className="text-[12px] text-soft">{t('backups.version_hint')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={activeVariant.id}
              onValueChange={setVariantId}
              disabled={isBusy || isRunning}
              ariaLabel={t('backups.version_title')}
              className="w-44"
              options={variants.map((variant) => ({ value: variant.id, label: variant.name }))}
            />
            <Select
              value={versionId}
              onValueChange={setVersionId}
              disabled={isBusy || isRunning}
              ariaLabel={t('backups.version_title')}
              className="w-36"
              options={versions.map((version) => ({ value: version, label: version }))}
            />
            <Button
              variant="secondary"
              disabled={isBusy || isRunning || !versionId}
              onClick={() =>
                window.confirm(t('backups.version_confirm')) &&
                void run(() => installServer(activeVariant.id, versionId, instanceId), 'backups.version_started')
              }
            >
              {t('backups.version_update')}
            </Button>
          </div>
        </div>
      )}

      {isRunning && <p className="text-[12px] text-mute">{t('backups.stop_first')}</p>}
      {backups.length === 0 && <p className="text-[13px] text-mute">{t('backups.empty')}</p>}

      <ul className="space-y-2">
        {backups.map((backup) => (
          <li
            key={backup.name}
            className="flex items-center justify-between gap-3 rounded-[8px] border border-hairline bg-surface-2 p-3.5"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[12px] text-ink">{backup.name}</div>
              <div className="text-[11px] text-mute">
                {new Date(backup.createdAt).toLocaleString()} · {(backup.sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={isBusy || isRunning}
                leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => handleRestore(backup.name)}
              >
                {t('backups.restore')}
              </Button>
              <button
                type="button"
                aria-label={t('backups.delete')}
                title={t('backups.delete')}
                disabled={isBusy}
                className="cursor-pointer rounded-[4px] p-1 text-mute hover:bg-surface-3 hover:text-danger-fg"
                onClick={() => void run(() => deleteBackup(instanceId, backup.name), 'backups.deleted')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
