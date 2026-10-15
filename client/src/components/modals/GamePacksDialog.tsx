import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchGamePacks, reloadGamePacks, trustGamePack } from '../../api/daemonApi';
import type { GamePackInfo } from '../../types/daemon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface GamePacksDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after packs changed so the game list is refetched. */
  onChanged: () => void;
}

export const GamePacksDialog: React.FC<GamePacksDialogProps> = ({ open, onClose, onChanged }) => {
  const { t } = useTranslation();
  const [packs, setPacks] = useState<GamePackInfo[]>([]);
  const [gamesDir, setGamesDir] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (operation: () => Promise<{ gamesDir?: string; packs: GamePackInfo[] }>, notify: boolean) => {
      setIsBusy(true);
      setError(null);
      try {
        const result = await operation();
        setPacks(result.packs);
        if (result.gamesDir) setGamesDir(result.gamesDir);
        if (notify) onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsBusy(false);
      }
    },
    [onChanged]
  );

  useEffect(() => {
    if (!open) return;
    // Deferred so the effect itself never sets state synchronously.
    void Promise.resolve().then(() => run(fetchGamePacks, false));
  }, [open, run]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="lg"
      title={t('packs.title')}
      description={t('packs.description')}
      footer={
        <Button
          variant="secondary"
          loading={isBusy}
          onClick={() => void run(reloadGamePacks, true)}
          leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          {t('packs.reload')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-[12px] text-soft">
          <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mute" />
          <span>
            {t('packs.folder_hint')} <code className="font-mono text-ink">{gamesDir}</code>
          </span>
        </p>

        {error && <p className="text-[12px] text-danger-fg">{error}</p>}
        {packs.length === 0 && !isBusy && <p className="text-[13px] text-mute">{t('packs.empty')}</p>}

        <ul className="space-y-2">
          {packs.map((pack) => (
            <li key={pack.dir} className="rounded-[8px] border border-hairline bg-surface-2 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{pack.name ?? pack.dir}</span>
                    {pack.version && <span className="font-mono text-[11px] text-mute">v{pack.version}</span>}
                  </div>
                  <div className="truncate font-mono text-[11px] text-mute">{pack.id ?? pack.dir}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {pack.loaded ? <Badge variant="success">{t('packs.loaded')}</Badge> : <Badge variant="danger">{t('packs.invalid')}</Badge>}
                  {pack.hasCode && (
                    <Badge variant={pack.trusted ? 'accent' : 'warning'}>
                      {pack.trusted ? t('packs.code_trusted') : t('packs.code_untrusted')}
                    </Badge>
                  )}
                </div>
              </div>

              {pack.errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12px] text-danger-fg">
                  {pack.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}

              {pack.hasCode && !pack.trusted && pack.id && (
                <div className="mt-3 flex items-start gap-3 rounded-[6px] border border-warning bg-warning-soft p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="space-y-2 text-[12px]">
                    <p className="leading-relaxed text-soft">{t('packs.trust_warning')}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={isBusy}
                      leadingIcon={<ShieldCheck className="h-3.5 w-3.5" />}
                      onClick={() => void run(() => trustGamePack(pack.id as string), true)}
                    >
                      {t('packs.trust_button')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
};
