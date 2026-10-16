import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import {
  createGamePackFromTemplate,
  fetchGamePacks,
  installGamePack,
  openGamePacksFolder,
  reloadGamePacks,
  setGamePackEnabled,
  trustGamePack,
  uninstallGamePack
} from '../../api/daemonApi';
import { isTauriRuntime } from '../../config/daemon';
import { Input } from '../ui/Input';
import type { GamePackInfo } from '../../types/daemon';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Tabs, type TabItem } from '../ui/Tabs';
import { CatalogPacks } from '../packs/CatalogPacks';
import { InstalledPackCard } from '../packs/InstalledPackCard';

type PacksTab = 'installed' | 'catalog';

const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;

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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [installPath, setInstallPath] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [tab, setTab] = useState<PacksTab>('installed');
  // Bumped when packs change outside the catalog tab so it shows the right installed state next time.
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  // Toggles are optimistic and only lock their own switch, so the rest of the dialog never flashes.
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Kept in a ref so a new parent callback identity never retriggers the fetch effect.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const run = useCallback(
    async (operation: () => Promise<{ gamesDir?: string; packs: GamePackInfo[] }>, notify: boolean) => {
      setIsBusy(true);
      setError(null);
      try {
        const result = await operation();
        setPacks(result.packs);
        if (result.gamesDir) setGamesDir(result.gamesDir);
        if (notify) {
          onChangedRef.current();
          setCatalogRefresh((value) => value + 1);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsBusy(false);
        setHasLoaded(true);
      }
    },
    []
  );

  const togglePack = async (packId: string, enabled: boolean) => {
    if (togglingId) return;
    setTogglingId(packId);
    setError(null);
    setPacks((current) => current.map((pack) => (pack.id === packId ? { ...pack, enabled, loaded: enabled } : pack)));
    try {
      const result = await setGamePackEnabled(packId, enabled);
      setPacks(result.packs);
      onChangedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Put the real state back.
      void fetchGamePacks()
        .then((result) => setPacks(result.packs))
        .catch(() => undefined);
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    // Deferred so the effect itself never sets state synchronously.
    void Promise.resolve().then(() => run(fetchGamePacks, false));
  }, [open, run]);

  const tabItems: TabItem<PacksTab>[] = [
    { id: 'installed', label: t('packs.tab_installed') },
    { id: 'catalog', label: t('packs.tab_catalog') }
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="lg"
      height="fixed"
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
        <Tabs items={tabItems} value={tab} onValueChange={setTab} />
        {tab === 'installed' ? (
          <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={installPath}
              placeholder={t('packs.install_placeholder')}
              className="font-mono text-[12px]"
              onChange={(event) => setInstallPath(event.target.value)}
            />
            {isTauriRuntime() && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
                  const selected = await openDialog({ directory: true, multiple: false, title: t('packs.install_title') });
                  if (typeof selected === 'string') setInstallPath(selected);
                }}
              >
                {t('import_server.browse')}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!installPath.trim()}
              loading={isBusy}
              leadingIcon={<FolderInput className="h-3.5 w-3.5" />}
              onClick={() =>
                void run(() => installGamePack(installPath.trim()), true).then(() => setInstallPath(''))
              }
            >
              {t('packs.install_button')}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={templateId}
              placeholder={t('packs.template_placeholder')}
              className="font-mono text-[12px]"
              onChange={(event) => setTemplateId(event.target.value.toLowerCase())}
            />
            <Button
              variant="secondary"
              disabled={!PACK_ID_PATTERN.test(templateId.trim())}
              loading={isBusy}
              leadingIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() =>
                void run(() => createGamePackFromTemplate(templateId.trim()), true).then(() => setTemplateId(''))
              }
            >
              {t('packs.template_button')}
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<FolderOpen className="h-3.5 w-3.5" />}
              onClick={() => void openGamePacksFolder().catch((err) => setError(err instanceof Error ? err.message : String(err)))}
            >
              {t('packs.open_folder')}
            </Button>
          </div>

          <p className="flex items-start gap-2 text-[12px] text-soft">
            <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mute" />
            <span>
              {t('packs.folder_hint')} <code className="font-mono text-ink">{gamesDir}</code>
            </span>
          </p>

          {error && <p className="text-[12px] text-danger-fg">{error}</p>}
          {packs.length === 0 && hasLoaded && !isBusy && <p className="text-[13px] text-mute">{t('packs.empty')}</p>}

          <ul className="space-y-2">
            {packs.map((pack) => (
              <InstalledPackCard
                key={pack.id ?? pack.dir}
                pack={pack}
                isBusy={isBusy}
                isToggling={togglingId === pack.id}
                onToggle={(packId, enabled) => void togglePack(packId, enabled)}
                onUninstall={(packId) => void run(() => uninstallGamePack(packId), true)}
                onTrust={(packId) => void run(() => trustGamePack(packId), true)}
              />
            ))}
          </ul>
          </div>
        ) : (
          <CatalogPacks
            refreshKey={catalogRefresh}
            onInstalled={(installed) => {
              setPacks(installed);
              onChangedRef.current();
            }}
          />
        )}
      </div>
    </Dialog>
  );
};
