import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import {
  FolderInput,
  FolderOpen,
  Globe,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  Puzzle,
  RefreshCw,
  Settings2,
  Sparkles,
  Star,
  Sun,
  Trash2
} from 'lucide-react';
import type { InstanceInfo, ServerStatus } from '../../types/daemon';
import type { LanguageOption } from '../../hooks/useLocales';
import type { Theme } from '../../hooks/useTheme';
import { ServerAvatar } from '../common/ServerAvatar';
import { StatusDot } from '../common/StatusDot';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ContextMenu } from '../ui/ContextMenu';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { DropdownMenu, type MenuItem } from '../ui/DropdownMenu';
import { cn } from '../../utils/cn';

interface SidebarProps {
  instances: InstanceInfo[];
  activeInstanceId: string;
  /** Live status per instance id (overrides the snapshot stored on the instance). */
  statuses: Record<string, ServerStatus>;
  onSelectInstance: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onOpenGamePacks: () => void;
  languages: LanguageOption[];
  currentLanguage: string;
  onChangeLanguage: (code: string) => void;
  onEditInstance: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onRenameInstance: (id: string, name: string) => Promise<void> | void;
  onToggleFavorite: (id: string, favorite: boolean) => Promise<void> | void;
  onRemoveInstance: (id: string) => Promise<void> | void;
  theme: Theme;
  onToggleTheme: () => void;
  appVersion: string | null;
  onCheckUpdates?: () => void;
  isCheckingUpdates?: boolean;
  /** Dev-only simulated telemetry trigger. */
  onMock?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  instances,
  activeInstanceId,
  statuses,
  onSelectInstance,
  onCreate,
  onImport,
  onOpenGamePacks,
  languages,
  currentLanguage,
  onChangeLanguage,
  onEditInstance,
  onOpenFolder,
  onRenameInstance,
  onToggleFavorite,
  onRemoveInstance,
  theme,
  onToggleTheme,
  appVersion,
  onCheckUpdates,
  isCheckingUpdates,
  onMock
}) => {
  const { t } = useTranslation();
  const currentLang = currentLanguage;
  const languageItems: MenuItem[] = languages.map((language) => ({
    id: language.code,
    label: `${language.name}${language.code === currentLanguage ? '  ✓' : ''}`,
    onSelect: () => onChangeLanguage(language.code)
  }));
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<InstanceInfo | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Favorites float to the top; the rest keep the daemon's order.
  const sortedInstances = useMemo(
    () => [...instances].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))),
    [instances]
  );

  const buildItems = (instance: InstanceInfo): MenuItem[] => [
    {
      id: 'edit',
      label: t('sidebar.menu_edit'),
      icon: <Settings2 className="h-3.5 w-3.5" />,
      onSelect: () => onEditInstance(instance.id)
    },
    {
      id: 'open-folder',
      label: t('sidebar.menu_open_folder'),
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      onSelect: () => onOpenFolder(instance.id)
    },
    {
      id: 'rename',
      label: t('sidebar.menu_rename'),
      icon: <Pencil className="h-3.5 w-3.5" />,
      onSelect: () => setRenaming({ id: instance.id, name: instance.name })
    },
    {
      id: 'favorite',
      label: instance.favorite ? t('sidebar.menu_unfavorite') : t('sidebar.menu_favorite'),
      icon: <Star className={cn('h-3.5 w-3.5', instance.favorite && 'fill-current text-warning')} />,
      onSelect: () => void onToggleFavorite(instance.id, !instance.favorite)
    },
    {
      id: 'remove',
      label: instance.isImported ? t('sidebar.menu_remove') : t('sidebar.menu_delete'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      danger: true,
      separatorBefore: true,
      onSelect: () => setRemoving(instance)
    }
  ];

  const menuInstance = menu ? instances.find((instance) => instance.id === menu.id) : undefined;

  return (
    <aside className="flex h-full w-64 shrink-0 select-none flex-col border-r border-hairline bg-surface">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0 object-contain" />
        <span className="text-[18px] font-semibold tracking-[-0.36px] text-ink">{t('header.title')}</span>
      </div>

      <div className="space-y-2 px-3 pb-3">
        <Button variant="primary" className="w-full" onClick={onCreate} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
          {t('sidebar.new_server')}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={onImport}
          leadingIcon={<FolderInput className="h-3.5 w-3.5 text-mute" />}
        >
          {t('header.import_server')}
        </Button>
      </div>

      <div className="px-4 pb-1.5 pt-2 font-mono text-[11px] uppercase tracking-wide text-mute">
        {t('sidebar.servers')}
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2" aria-label={t('sidebar.servers')}>
        {instances.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-mute">{t('header.no_servers')}</p>
        )}
        <AnimatePresence initial={false}>
        {sortedInstances.map((instance) => {
          const isActive = instance.id === activeInstanceId;
          const status = statuses[instance.id] ?? instance.status ?? 'OFFLINE';
          return (
            <motion.div
              key={instance.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
            <div
              className="group relative"
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ id: instance.id, x: event.clientX, y: event.clientY });
              }}
            >
            <button
              type="button"
              onClick={() => onSelectInstance(instance.id)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[6px] px-2 py-2 text-left transition-colors duration-[var(--duration-fast)] cursor-pointer',
                isActive ? 'bg-surface-3 text-ink' : 'text-body hover:bg-surface-2 hover:text-ink'
              )}
            >
              <ServerAvatar instance={instance} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{instance.name}</span>
                <span className="block truncate font-mono text-[11px] text-mute">:{instance.port}</span>
              </span>
              {instance.favorite && <Star className="h-3 w-3 shrink-0 fill-current text-warning" />}
              <StatusDot status={status} />
            </button>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <DropdownMenu
                items={buildItems(instance)}
                trigger={
                  <button
                    type="button"
                    aria-label={t('sidebar.menu_more')}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[4px] bg-surface-3 text-mute hover:text-ink"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </div>
            </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </nav>

      <div className="space-y-2 border-t border-hairline p-3">
        <div className="flex items-center gap-1.5">
          <DropdownMenu
            align="start"
            items={languageItems}
            trigger={
              <IconButton label={t('sidebar.language')} variant="secondary">
                <Globe className="h-3.5 w-3.5 text-mute" />
              </IconButton>
            }
          />
          <span className="font-mono text-[11px] uppercase text-mute">{currentLang}</span>
          <div className="flex-1" />
          <IconButton label={t('sidebar.game_packs')} variant="secondary" onClick={onOpenGamePacks}>
            <Puzzle className="h-3.5 w-3.5 text-mute" />
          </IconButton>
          {onMock && (
            <IconButton label={t('header.mock_button')} variant="secondary" onClick={onMock}>
              <Sparkles className="h-3.5 w-3.5 text-mute" />
            </IconButton>
          )}
          <IconButton
            label={theme === 'dark' ? t('header.theme_light') : t('header.theme_dark')}
            variant="secondary"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-warning" /> : <Moon className="h-3.5 w-3.5 text-mute" />}
          </IconButton>
        </div>

        <div className="flex items-center justify-between text-[11px] text-mute">
          <span className="font-mono">{appVersion ? t('sidebar.version', { version: appVersion }) : ''}</span>
          {onCheckUpdates && (
            <button
              type="button"
              onClick={onCheckUpdates}
              disabled={isCheckingUpdates}
              className="flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-mute transition hover:bg-surface-3 hover:text-ink disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={cn('h-3 w-3', isCheckingUpdates && 'animate-spin')} />
              {t('updater.check_for_updates')}
            </button>
          )}
        </div>
      </div>
    
      {menu && menuInstance && (
        <ContextMenu position={{ x: menu.x, y: menu.y }} items={buildItems(menuInstance)} onClose={() => setMenu(null)} />
      )}

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={t('sidebar.rename_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {t('sidebar.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!renaming?.name.trim()}
              onClick={() => {
                if (renaming?.name.trim()) void onRenameInstance(renaming.id, renaming.name.trim());
                setRenaming(null);
              }}
            >
              {t('sidebar.rename_save')}
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          value={renaming?.name ?? ''}
          onChange={(event) => setRenaming((current) => (current ? { ...current, name: event.target.value } : current))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && renaming?.name.trim()) {
              void onRenameInstance(renaming.id, renaming.name.trim());
              setRenaming(null);
            }
          }}
        />
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && !isRemoving && setRemoving(null)}
        title={removing?.isImported ? t('sidebar.remove_title') : t('sidebar.delete_title')}
        description={
          removing?.isImported
            ? t('sidebar.remove_imported_desc', { name: removing?.name })
            : t('sidebar.delete_created_desc', { name: removing?.name })
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={isRemoving}>
              {t('sidebar.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={isRemoving}
              onClick={async () => {
                if (!removing) return;
                setIsRemoving(true);
                try {
                  await onRemoveInstance(removing.id);
                } finally {
                  setIsRemoving(false);
                  setRemoving(null);
                }
              }}
            >
              {removing?.isImported ? t('sidebar.menu_remove') : t('sidebar.menu_delete')}
            </Button>
          </>
        }
      />
    </aside>
  );
};
