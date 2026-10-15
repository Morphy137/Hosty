import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cpu,
  HardDrive,
  Users,
  Terminal,
  Heart,
  Gift,
  Zap,
  Skull,
  LogOut,
  ChevronRight,
  Server,
  Settings,
  RotateCcw,
  Copy,
  Check,
  Layers,
  Search,
  Activity,
  Wifi,
  Snowflake,
  VolumeX,
  Package
} from 'lucide-react';
import type { DaemonAction, InstanceInfo, Metrics, PlayerState, ServerStatus } from '../../types/daemon';
import { calculateRamPercent, formatDimensionName } from '../../utils/format';
import { buildPlayerCommand, type PlayerAction } from '../../utils/playerCommands';
import { DimensionIcon } from '../common/DimensionIcon';
import { PlayerActionModal, type DynamicActionType } from '../modals/PlayerActionModal';
import { getInstanceIconUrl } from '../../api/daemonApi';
import { SlidingText } from '../common/SlidingText';
import { GameLogo } from '../common/GameIcons';

interface OverviewTabProps {
  metrics: Metrics;
  players: PlayerState[];
  logs: string[];
  instance: InstanceInfo | null;
  status: ServerStatus;
  onSendCommand: (command: string) => void;
  onSendAction?: (action: DaemonAction, data?: unknown) => boolean;
  onOpenEditModal: () => void;
  onRestart: () => void;
  onInspectInventory?: (player: PlayerState) => void;
}

const QUICK_COMMANDS = [
  { label: 'weather clear', cmd: 'weather clear' },
  { label: 'time set day', cmd: 'time set day' },
  { label: 'save-all', cmd: 'save-all' },
  { label: 'list', cmd: 'list' }
];

export const OverviewTab: React.FC<OverviewTabProps> = ({
  metrics,
  players,
  logs,
  instance,
  status,
  onSendCommand,
  onSendAction,
  onOpenEditModal,
  onRestart,
  onInspectInventory
}) => {
  const { t } = useTranslation();
  const [commandInput, setCommandInput] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [copiedIp, setCopiedIp] = useState(false);
  const [actionTarget, setActionTarget] = useState<{
    player: PlayerState;
    type: DynamicActionType;
  } | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const ramPercent = calculateRamPercent(metrics.ramMb, metrics.maxRamMb);
  const serverPort = instance?.port || 25565;
  const serverAddress = `127.0.0.1:${serverPort}`;
  const maxPlayersCount = instance?.maxPlayers || 20;

  const filteredOverviewPlayers = players.filter((p) =>
    p.username.toLowerCase().includes(playerSearch.toLowerCase())
  );

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    onSendCommand(trimmed);
    setCommandInput('');
  };

  const handlePlayerAction = (username: string, action: PlayerAction) => {
    if (onSendAction && (action === 'KILL' || action === 'KICK')) {
      onSendAction('ACTION', {
        action,
        username,
        reason: 'Kicked by administrator'
      });
      return;
    }
    const cmd = buildPlayerCommand(action, username, 'Kicked by administrator');
    onSendCommand(cmd);
  };

  const handleCopyIp = () => {
    navigator.clipboard.writeText(serverAddress);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 1500);
  };

  return (
    <>
      {/* MCSS Inspired Server Hero Banner */}
      <div className="geist-card p-4 flex items-center justify-between shrink-0 shadow-xs bg-surface border border-hairline transition-colors">
        <div className="flex items-center gap-4 min-w-0">
          {/* Server Icon with fallback */}
          <div className="w-14 h-14 rounded-[8px] border border-hairline bg-surface-2 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
            {instance?.hasIcon ? (
              <img
                src={getInstanceIconUrl(instance.id)}
                alt={instance.name}
                className="w-full h-full object-contain image-rendering-pixelated"
              />
            ) : (
              <Server className="w-7 h-7 text-mute" />
            )}
          </div>

          {/* Server Meta & Live Status */}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[17px] font-semibold tracking-[-0.34px] text-ink truncate">
                {instance?.name || 'Local Minecraft Server'}
              </h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-surface-2 border border-hairline font-mono text-[11px] font-medium uppercase tracking-wider text-ink">
                <span
                  className={`w-2 h-2 rounded-[2px] shrink-0 ${
                    status === 'ONLINE'
                      ? 'bg-success shadow-[0_0_6px_rgba(80,227,194,0.35)]'
                      : status === 'STARTING'
                      ? 'bg-warning animate-pulse'
                      : 'bg-mute'
                  }`}
                />
                {status}
              </span>
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-surface-2 border border-hairline text-soft uppercase flex items-center gap-1.5">
                <GameLogo gameId={instance?.gameId || 'minecraft'} size={14} />
                <span>
                  {instance?.gameId === 'project-zomboid'
                    ? 'Project Zomboid'
                    : instance?.gameId === 'hytale'
                    ? 'Hytale'
                    : 'Minecraft'}
                </span>
              </span>
              {metrics.bridgeConnected && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-success/10 dark:bg-success/15 border border-success/30 text-success-fg font-mono text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  {t('overview.metrics.bridge_connected')}
                </span>
              )}
            </div>

            {/* Sub-meta Strip: IP, Loader, Player Count, MOTD */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12px] text-soft">
              {/* Network Address with Copy */}
              <button
                type="button"
                onClick={handleCopyIp}
                className="inline-flex items-center gap-1 font-mono text-ink hover:text-accent-fg transition cursor-pointer"
                title={t('overview.copy_ip_title')}
              >
                <span>{serverAddress}</span>
                {copiedIp ? (
                  <Check className="w-3 h-3 text-success-fg" />
                ) : (
                  <Copy className="w-3 h-3 text-mute" />
                )}
              </button>

              <span className="text-hairline-strong">|</span>

              {/* Loader */}
              <span className="inline-flex items-center gap-1 text-body">
                <Layers className="w-3.5 h-3.5 text-mute" />
                <span>
                  {instance?.loader ? `${instance.loader.toUpperCase()} ${instance.loaderVersion || ''}` : 'Vanilla'}
                </span>
              </span>

              <span className="text-hairline-strong">|</span>

              {/* Player Count */}
              <span className="inline-flex items-center gap-1 text-body">
                <Users className="w-3.5 h-3.5 text-mute" />
                <span>
                  {players.length}/{maxPlayersCount} {t('overview.metrics.players_online')}
                </span>
              </span>

              <span className="text-hairline-strong">|</span>

              {/* MOTD */}
              <span className="italic text-mute truncate max-w-sm">
                &ldquo;{instance?.motd || 'No description for this server'}&rdquo;
              </span>
            </div>
          </div>
        </div>

        {/* Hero Actions: Edit Server & Restart */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRestart}
            disabled={status === 'OFFLINE'}
            className="h-8 px-3 rounded-[6px] bg-surface hover:bg-surface-2 disabled:opacity-40 text-ink border border-hairline text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title={t('overview.controls.restart')}
          >
            <RotateCcw className="w-3.5 h-3.5 text-mute" />
            <span>{t('overview.controls.restart')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenEditModal}
            className="h-8 px-3 rounded-[6px] bg-surface hover:bg-surface-2 text-ink border border-hairline text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title={t('edit_server.modal_title')}
          >
            <Settings className="w-3.5 h-3.5 text-mute" />
            <span>{t('edit_server.button')}</span>
          </button>
        </div>
      </div>

      {/* Top 4-Up Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="geist-card p-4 flex flex-col justify-between bg-surface border border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-mute">
              {t('overview.metrics.cpu')}
            </span>
            <Cpu className="w-4 h-4 text-mute" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-ink">
              {metrics.cpu}%
            </span>
            <span className="font-mono text-[12px] text-mute">java.exe</span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-surface-3 rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-ink transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.cpu)}%` }}
            />
          </div>
        </div>

        <div className="geist-card p-4 flex flex-col justify-between bg-surface border border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-mute">
              {t('overview.metrics.ram')}
            </span>
            <HardDrive className="w-4 h-4 text-mute" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-ink">
              {metrics.ramMb} MB
            </span>
            <span className="font-mono text-[12px] text-mute">
              / {metrics.maxRamMb} MB ({ramPercent}%)
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-surface-3 rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-ink transition-all duration-300"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>

        {/* TPS / MSPT Performance Card */}
        <div className="geist-card p-4 flex flex-col justify-between bg-surface border border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-mute">
              {t('overview.metrics.tps')}
            </span>
            <Activity className="w-4 h-4 text-mute" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-[24px] font-semibold tracking-[-0.96px] ${
                status !== 'ONLINE'
                  ? 'text-mute'
                  : (metrics.tps ?? 20) >= 19.5
                  ? 'text-success-fg'
                  : (metrics.tps ?? 20) >= 15
                  ? 'text-warning'
                  : 'text-danger-fg'
              }`}
            >
              {status === 'ONLINE'
                ? metrics.tps !== undefined
                  ? metrics.tps.toFixed(1)
                  : '20.0'
                : '--'}{' '}
              <span className="text-[14px] font-normal text-mute">TPS</span>
            </span>
            <span className="font-mono text-[12px] text-mute">
              {status === 'ONLINE' && metrics.mspt !== undefined
                ? `${metrics.mspt.toFixed(1)} ms`
                : t('overview.metrics.mspt')}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-surface-3 rounded-[2px] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                status !== 'ONLINE'
                  ? 'bg-transparent'
                  : (metrics.tps ?? 20) >= 19.5
                  ? 'bg-success'
                  : (metrics.tps ?? 20) >= 15
                  ? 'bg-warning'
                  : 'bg-danger'
              }`}
              style={{
                width: `${
                  status === 'ONLINE'
                    ? Math.min(100, ((metrics.tps ?? 20) / 20) * 100)
                    : 0
                }%`
              }}
            />
          </div>
        </div>

        {/* Connected Players & Port Card */}
        <div className="geist-card p-4 flex flex-col justify-between bg-surface border border-hairline">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-mute">
              {t('overview.metrics.players_online')}
            </span>
            <Users className="w-4 h-4 text-mute" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-ink">
              {players.length}
            </span>
            <span className="font-mono text-[12px] text-mute">
              / {maxPlayersCount} Max
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[12px] text-body">
            <span>{t('overview.controls.address')}:</span>
            <span className="font-mono text-ink">localhost:{serverPort}</span>
          </div>
        </div>
      </div>

      {/* Lower Split Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Left Column: Connected Players Table/Cards */}
        <div className="col-span-5 geist-card flex flex-col overflow-hidden bg-surface border border-hairline">
          {/* Header */}
          <div className="px-4 py-3 border-b border-hairline flex items-center justify-between bg-surface-2/50">
            <div>
              <h2 className="text-[14px] font-medium tracking-[-0.28px] text-ink">
                {t('overview.players.title')}
              </h2>
            </div>
            <span className="font-mono text-[12px] text-mute">
              {players.length} online
            </span>
          </div>

          {/* Quick Player Search in Overview */}
          <div className="px-3 py-2 border-b border-hairline bg-surface flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-mute absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder={t('overview.players.search_placeholder')}
                className="w-full h-7 pl-8 pr-2.5 rounded-[4px] bg-surface-2 border border-hairline text-[12px] text-ink placeholder-mute focus:outline-none focus:border-ink"
              />
            </div>
            {playerSearch && (
              <button
                type="button"
                onClick={() => setPlayerSearch('')}
                className="text-[11px] text-mute hover:text-ink cursor-pointer"
              >
                {t('overview.players.clear_search')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-hairline">
            {filteredOverviewPlayers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <p className="text-[14px] font-medium text-ink">
                  {playerSearch ? t('overview.players.no_matches') : t('overview.players.empty')}
                </p>
                <p className="text-[13px] text-mute mt-1 max-w-xs">
                  {playerSearch
                    ? t('overview.players.no_matches_description')
                    : t('players.empty_description')}
                </p>
              </div>
            ) : (
              filteredOverviewPlayers.map((p) => {
                const dimLabel = formatDimensionName(p.dimension, t);

                return (
                  <div
                    key={p.username}
                    className="p-4 hover:bg-surface-2 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://mc-heads.net/avatar/${p.username}/40`}
                          alt={p.username}
                          className="w-9 h-9 rounded-[6px] border border-hairline"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[14px] font-medium tracking-[-0.28px] text-ink">
                              {p.username}
                            </span>
                            {p.isOp && (
                              <span className="px-1 py-0.2 rounded-[3px] bg-warning/15 border border-warning/30 text-warning font-mono text-[9px] font-bold">
                                {t('overview.players.operator')}
                              </span>
                            )}
                            {p.isFrozen && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-accent/15 border border-accent/30 text-accent-fg font-mono text-[9px] font-bold">
                                <Snowflake className="w-2.5 h-2.5" />
                                {t('players.frozen')}
                              </span>
                            )}
                            {p.isMuted && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-danger/15 border border-danger/30 text-danger-fg font-mono text-[9px] font-bold">
                                <VolumeX className="w-2.5 h-2.5" />
                                {t('players.muted')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-mute flex-wrap">
                            <span>XYZ: {p.x}, {p.y}, {p.z}</span>
                            {p.ping !== undefined && (
                              <>
                                <span>&bull;</span>
                                <span className="inline-flex items-center gap-0.5 text-success-fg">
                                  <Wifi className="w-2.5 h-2.5" />
                                  {p.ping}ms
                                </span>
                              </>
                            )}
                            {p.health !== undefined && (
                              <>
                                <span>&bull;</span>
                                <span className="inline-flex items-center gap-0.5 text-danger-fg">
                                  <Heart className="w-2.5 h-2.5 fill-danger-fg" />
                                  {p.health} HP
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-surface-2 border border-hairline font-mono text-[11px] text-body">
                        <DimensionIcon dimension={p.dimension} className="w-3.5 h-3.5" />
                        {dimLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      {onInspectInventory && (
                        <button
                          type="button"
                          onClick={() => onInspectInventory(p)}
                          className="flex-1 h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                          title={t('players.inventory_button')}
                        >
                          <Package className="w-[11px] h-[11px] text-ink shrink-0" />
                          <SlidingText>{t('players.actions.inventory_short')}</SlidingText>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'HEAL' })}
                        className="flex-1 h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-danger/40 text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('overview.players.feed')}
                      >
                        <Heart className="w-[11px] h-[11px] text-danger-fg shrink-0" />
                        <SlidingText>{t('overview.players.feed')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'GIFT' })}
                        className="flex-1 h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-accent/40 text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('players.actions.gift')}
                      >
                        <Gift className="w-[11px] h-[11px] text-accent-fg shrink-0" />
                        <SlidingText>{t('players.actions.gift')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'DAMAGE' })}
                        className="flex-1 h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-warning/40 text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('players.actions.hurt')}
                      >
                        <Zap className="w-[11px] h-[11px] text-warning shrink-0" />
                        <SlidingText>{t('players.actions.hurt')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayerAction(p.username, 'KILL')}
                        className="flex-1 h-7 rounded-[6px] bg-surface hover:bg-danger-soft border border-hairline hover:border-danger/40 text-[11px] font-medium text-danger-fg flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('players.actions.kill')}
                      >
                        <Skull className="w-[11px] h-[11px] text-danger-fg shrink-0" />
                        <SlidingText>{t('players.actions.kill')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayerAction(p.username, 'KICK')}
                        className="flex-1 h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-mute/40 text-[11px] font-medium text-body flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('overview.players.kick')}
                      >
                        <LogOut className="w-[11px] h-[11px] shrink-0" />
                        <SlidingText>{t('overview.players.kick')}</SlidingText>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Console */}
        <div className="col-span-7 rounded-[8px] bg-console border border-white/10 text-white flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-white/50" />
              <span className="font-mono text-[12px] text-on-dark">
                {t('overview.console_source')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {QUICK_COMMANDS.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => onSendCommand(item.cmd)}
                  className="px-2 py-0.5 rounded-[4px] bg-white/10 hover:bg-white/20 font-mono text-[11px] text-white/50 hover:text-white transition cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-[20px] space-y-1">
            {logs.length === 0 ? (
              <div className="text-white/50">
                {t('overview.console_ready')}
              </div>
            ) : (
              logs.map((line, idx) => (
                <div
                  key={idx}
                  className={`break-all ${
                    line.includes('WARN')
                      ? 'text-warning'
                      : line.includes('ERROR')
                      ? 'text-red-400'
                      : line.startsWith('>')
                      ? 'text-success'
                      : 'text-on-dark'
                  }`}
                >
                  {line}
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>

          <form
            onSubmit={handleCommandSubmit}
            className="p-2.5 border-t border-white/10 bg-transparent flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4 text-white/50 ml-1" />
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={t('overview.console.placeholder')}
              className="flex-1 bg-transparent font-mono text-[13px] text-white placeholder-white/40 focus:outline-none"
            />
            <button
              type="submit"
              className="h-7 px-3 rounded-[6px] bg-white hover:bg-white/80 text-black text-[12px] font-medium transition cursor-pointer"
            >
              {t('overview.console.send')}
            </button>
          </form>
        </div>
      </div>

      {actionTarget && (
        <PlayerActionModal
          player={actionTarget.player}
          actionType={actionTarget.type}
          onClose={() => setActionTarget(null)}
          onExecute={onSendCommand}
        />
      )}
    </>
  );
};
