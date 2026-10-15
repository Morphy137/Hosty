import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Archive, Copy, Globe, Ellipsis, FileCode, Loader2, Package, Play, RotateCcw, Settings, Skull, Square, Users, Sliders } from 'lucide-react';
import type { DaemonAction, GameDriverSummary, InstanceInfo, ServerStatus } from '../../types/daemon';
import type { TabId } from '../../utils/tabs';
import { GameLogo } from '../common/GameIcons';
import { StatusDot } from '../common/StatusDot';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { DropdownMenu } from '../ui/DropdownMenu';
import { IconButton } from '../ui/IconButton';
import { Tabs, type TabItem } from '../ui/Tabs';
import { useToast } from '../ui/toastContext';

const TAB_ICONS: Record<TabId, React.ReactNode> = {
  overview: <Activity className="h-4 w-4" />,
  players: <Users className="h-4 w-4" />,
  mod_files: <Package className="h-4 w-4" />,
  mods: <FileCode className="h-4 w-4" />,
  properties: <Sliders className="h-4 w-4" />,
  backups: <Archive className="h-4 w-4" />,
  network: <Globe className="h-4 w-4" />
};

const STATUS_BADGE: Record<ServerStatus, BadgeVariant> = {
  OFFLINE: 'neutral',
  STARTING: 'warning',
  ONLINE: 'success',
  STOPPING: 'warning'
};

const STATUS_KEY: Record<ServerStatus, string> = {
  OFFLINE: 'overview.controls.status_offline',
  STARTING: 'overview.controls.status_starting',
  ONLINE: 'overview.controls.status_online',
  STOPPING: 'overview.controls.status_stopping'
};

interface ServerHeaderProps {
  instance: InstanceInfo;
  status: ServerStatus;
  game: GameDriverSummary | undefined;
  tabs: TabId[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onSendAction: (action: DaemonAction, data?: string) => boolean;
  onRestart: () => void;
  onEdit: () => void;
}

export const ServerHeader: React.FC<ServerHeaderProps> = ({
  instance,
  status,
  game,
  tabs,
  activeTab,
  onTabChange,
  onSendAction,
  onRestart,
  onEdit
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isKillDialogOpen, setIsKillDialogOpen] = useState(false);

  const address = `localhost:${instance.port}`;
  const isInstalled = instance.hasJar;
  const isRunning = status === 'ONLINE';
  const isTransitioning = status === 'STARTING' || status === 'STOPPING';

  // Variant names come from the game's installer (e.g. "PaperMC" for `paper`).
  const variantName = game?.installer?.variants.find((variant) => variant.id === instance.loader)?.name;
  const subtitle = [game?.name, variantName ?? instance.loader, instance.loaderVersion].filter(Boolean).join(' · ');

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: t('server_header.address_copied'), description: address, variant: 'success' });
    } catch {
      toast({ title: t('server_header.copy_failed'), variant: 'error' });
    }
  };

  const tabItems: TabItem<TabId>[] = tabs.map((id) => ({
    id,
    icon: TAB_ICONS[id],
    label: t(`nav.${id}`)
  }));

  return (
    <header className="shrink-0 border-b border-hairline bg-surface px-6 pt-4">
      <div className="flex items-center justify-between gap-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <GameLogo gameId={instance.gameId ?? ''} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[17px] font-semibold tracking-[-0.34px] text-ink">{instance.name}</h1>
              {isInstalled ? (
                <Badge variant={STATUS_BADGE[status]}>
                  <StatusDot status={status} className="h-1.5 w-1.5" />
                  {t(STATUS_KEY[status])}
                </Badge>
              ) : (
                <Badge variant="warning">{t('server_header.not_installed')}</Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-mute">
              {subtitle && <span className="truncate">{subtitle}</span>}
              {subtitle && <span aria-hidden="true">·</span>}
              <button
                type="button"
                onClick={copyAddress}
                title={t('overview.copy_ip_title')}
                className="group flex items-center gap-1 rounded-[4px] font-mono text-body transition hover:text-ink cursor-pointer"
              >
                {address}
                <Copy className="h-3 w-3 text-mute transition group-hover:text-ink" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isInstalled && (
            <>
              {isRunning || status === 'STOPPING' ? (
                <Button
                  variant="secondary"
                  className="min-w-[110px]"
                  disabled={status === 'STOPPING'}
                  onClick={() => onSendAction('STOP')}
                  leadingIcon={
                    status === 'STOPPING' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3 w-3 fill-current" />
                    )
                  }
                >
                  {t('overview.controls.stop')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="min-w-[110px]"
                  disabled={status === 'STARTING'}
                  onClick={() => onSendAction('START')}
                  leadingIcon={
                    status === 'STARTING' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )
                  }
                >
                  {t('overview.controls.start')}
                </Button>
              )}

              <DropdownMenu
                trigger={
                  <IconButton label={t('server_header.more_actions')} variant="secondary">
                    <Ellipsis className="h-4 w-4" />
                  </IconButton>
                }
                items={[
                  {
                    id: 'restart',
                    label: t('overview.controls.restart'),
                    icon: <RotateCcw className="h-3.5 w-3.5" />,
                    onSelect: onRestart,
                    disabled: status === 'OFFLINE' || isTransitioning
                  },
                  {
                    id: 'settings',
                    label: t('server_header.edit'),
                    icon: <Settings className="h-3.5 w-3.5" />,
                    onSelect: onEdit
                  },
                  {
                    id: 'kill',
                    label: t('overview.controls.kill'),
                    icon: <Skull className="h-3.5 w-3.5" />,
                    onSelect: () => setIsKillDialogOpen(true),
                    danger: true,
                    disabled: status === 'OFFLINE',
                    separatorBefore: true
                  }
                ]}
              />
            </>
          )}
          {!isInstalled && (
            <IconButton label={t('server_header.edit')} variant="secondary" onClick={onEdit}>
              <Settings className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      <Tabs items={tabItems} value={activeTab} onValueChange={onTabChange} />

      <Dialog
        open={isKillDialogOpen}
        onOpenChange={setIsKillDialogOpen}
        size="sm"
        title={t('server_header.kill_confirm_title')}
        description={t('server_header.kill_confirm_desc')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsKillDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              leadingIcon={<Skull className="h-3.5 w-3.5" />}
              onClick={() => {
                onSendAction('KILL');
                setIsKillDialogOpen(false);
              }}
            >
              {t('server_header.kill_confirm_action')}
            </Button>
          </>
        }
      />
    </header>
  );
};
