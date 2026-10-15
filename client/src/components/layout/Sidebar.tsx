import React from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { FolderInput, Globe, Moon, Plus, Puzzle, RefreshCw, Sparkles, Sun } from 'lucide-react';
import type { InstanceInfo, ServerStatus } from '../../types/daemon';
import { changeLanguage, type SupportedLanguage } from '../../i18n';
import type { Theme } from '../../hooks/useTheme';
import { GameLogo } from '../common/GameIcons';
import { StatusDot } from '../common/StatusDot';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
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
  theme,
  onToggleTheme,
  appVersion,
  onCheckUpdates,
  isCheckingUpdates,
  onMock
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language?.startsWith('es') ? 'es' : 'en') as SupportedLanguage;

  return (
    <aside className="flex h-full w-64 shrink-0 select-none flex-col border-r border-hairline bg-surface">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <img src="/logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
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
        {instances.map((instance) => {
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
            <button
              type="button"
              onClick={() => onSelectInstance(instance.id)}
              aria-current={isActive ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[6px] px-2 py-2 text-left transition-colors duration-[var(--duration-fast)] cursor-pointer',
                isActive ? 'bg-surface-3 text-ink' : 'text-body hover:bg-surface-2 hover:text-ink'
              )}
            >
              <GameLogo gameId={instance.gameId ?? 'minecraft'} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{instance.name}</span>
                <span className="block truncate font-mono text-[11px] text-mute">:{instance.port}</span>
              </span>
              <StatusDot status={status} />
            </button>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </nav>

      <div className="space-y-2 border-t border-hairline p-3">
        <div className="flex items-center gap-1.5">
          <IconButton
            label={currentLang === 'en' ? t('sidebar.language_to_es') : t('sidebar.language_to_en')}
            variant="secondary"
            onClick={() => changeLanguage(currentLang === 'en' ? 'es' : 'en')}
          >
            <Globe className="h-3.5 w-3.5 text-mute" />
          </IconButton>
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
    </aside>
  );
};
