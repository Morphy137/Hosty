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
  PackageSearch
} from 'lucide-react';
import type { DaemonAction, InstanceInfo, Metrics, PlayerState, ServerStatus } from '../../types/daemon';
import { calculateRamPercent, formatDimensionName } from '../../utils/format';
import { buildPlayerCommand, type PlayerAction } from '../../utils/playerCommands';
import { DimensionIcon } from '../common/DimensionIcon';
import { PlayerActionModal, type DynamicActionType } from '../modals/PlayerActionModal';
import { getInstanceIconUrl } from '../../api/daemonApi';
import { SlidingText } from '../common/SlidingText';

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
      <div className="geist-card p-4 flex items-center justify-between shrink-0 shadow-xs bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626] transition-colors">
        <div className="flex items-center gap-4 min-w-0">
          {/* Server Icon with fallback */}
          <div className="w-14 h-14 rounded-[8px] border border-[#ebebeb] dark:border-[#262626] bg-[#fafafa] dark:bg-[#141414] flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
            {instance?.hasIcon ? (
              <img
                src={getInstanceIconUrl(instance.id)}
                alt={instance.name}
                className="w-full h-full object-contain image-rendering-pixelated"
              />
            ) : (
              <Server className="w-7 h-7 text-[#888888] dark:text-[#707070]" />
            )}
          </div>

          {/* Server Meta & Live Status */}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[17px] font-semibold tracking-[-0.34px] text-[#171717] dark:text-[#ededed] truncate">
                {instance?.name || 'Local Minecraft Server'}
              </h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] font-medium uppercase tracking-wider text-[#171717] dark:text-[#ededed]">
                <span
                  className={`w-2 h-2 rounded-[2px] shrink-0 ${
                    status === 'ONLINE'
                      ? 'bg-[#50e3c2] shadow-[0_0_6px_rgba(80,227,194,0.35)]'
                      : status === 'STARTING'
                      ? 'bg-[#f5a623] animate-pulse'
                      : 'bg-[#888888]'
                  }`}
                />
                {status}
              </span>
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[#666666] dark:text-[#a1a1a1] uppercase">
                {instance?.gameId === 'project-zomboid'
                  ? 'Project Zomboid'
                  : instance?.gameId === 'hytale'
                  ? 'Hytale'
                  : 'Minecraft'}
              </span>
              {metrics.bridgeConnected && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#50e3c2]/10 dark:bg-[#50e3c2]/15 border border-[#50e3c2]/30 text-[#0f8c70] dark:text-[#50e3c2] font-mono text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#50e3c2] animate-pulse" />
                  {t('overview.metrics.bridge_connected')}
                </span>
              )}
            </div>

            {/* Sub-meta Strip: IP, Loader, Player Count, MOTD */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#666666] dark:text-[#888888]">
              {/* Network Address with Copy */}
              <button
                type="button"
                onClick={handleCopyIp}
                className="inline-flex items-center gap-1 font-mono text-[#171717] dark:text-[#ededed] hover:text-[#0070f3] dark:hover:text-[#0070f3] transition cursor-pointer"
                title="Click to copy IP"
              >
                <span>{serverAddress}</span>
                {copiedIp ? (
                  <Check className="w-3 h-3 text-[#50e3c2]" />
                ) : (
                  <Copy className="w-3 h-3 text-[#888888]" />
                )}
              </button>

              <span className="text-[#ebebeb] dark:text-[#333333]">|</span>

              {/* Loader */}
              <span className="inline-flex items-center gap-1 text-[#4d4d4d] dark:text-[#a1a1a1]">
                <Layers className="w-3.5 h-3.5 text-[#888888]" />
                <span>
                  {instance?.loader ? `${instance.loader.toUpperCase()} ${instance.loaderVersion || ''}` : 'Vanilla'}
                </span>
              </span>

              <span className="text-[#ebebeb] dark:text-[#333333]">|</span>

              {/* Player Count */}
              <span className="inline-flex items-center gap-1 text-[#4d4d4d] dark:text-[#a1a1a1]">
                <Users className="w-3.5 h-3.5 text-[#888888]" />
                <span>
                  {players.length}/{maxPlayersCount} {t('overview.metrics.players_online')}
                </span>
              </span>

              <span className="text-[#ebebeb] dark:text-[#333333]">|</span>

              {/* MOTD */}
              <span className="italic text-[#888888] dark:text-[#707070] truncate max-w-sm">
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
            className="h-8 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] disabled:opacity-40 text-[#171717] dark:text-[#ededed] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title={t('overview.controls.restart')}
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#888888]" />
            <span>{t('overview.controls.restart')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenEditModal}
            className="h-8 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#171717] dark:text-[#ededed] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title={t('edit_server.modal_title')}
          >
            <Settings className="w-3.5 h-3.5 text-[#888888]" />
            <span>{t('edit_server.button')}</span>
          </button>
        </div>
      </div>

      {/* Top 4-Up Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="geist-card p-4 flex flex-col justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.cpu')}
            </span>
            <Cpu className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717] dark:text-[#ededed]">
              {metrics.cpu}%
            </span>
            <span className="font-mono text-[12px] text-[#888888]">java.exe</span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] dark:bg-[#1f1f1f] rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-[#171717] dark:bg-[#ededed] transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.cpu)}%` }}
            />
          </div>
        </div>

        <div className="geist-card p-4 flex flex-col justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.ram')}
            </span>
            <HardDrive className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717] dark:text-[#ededed]">
              {metrics.ramMb} MB
            </span>
            <span className="font-mono text-[12px] text-[#888888]">
              / {metrics.maxRamMb} MB ({ramPercent}%)
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] dark:bg-[#1f1f1f] rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-[#171717] dark:bg-[#ededed] transition-all duration-300"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>

        {/* TPS / MSPT Performance Card */}
        <div className="geist-card p-4 flex flex-col justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.tps')}
            </span>
            <Activity className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-[24px] font-semibold tracking-[-0.96px] ${
                status !== 'ONLINE'
                  ? 'text-[#888888]'
                  : (metrics.tps ?? 20) >= 19.5
                  ? 'text-[#50e3c2]'
                  : (metrics.tps ?? 20) >= 15
                  ? 'text-[#f5a623]'
                  : 'text-[#ee0000]'
              }`}
            >
              {status === 'ONLINE'
                ? metrics.tps !== undefined
                  ? metrics.tps.toFixed(1)
                  : '20.0'
                : '--'}{' '}
              <span className="text-[14px] font-normal text-[#888888]">TPS</span>
            </span>
            <span className="font-mono text-[12px] text-[#888888]">
              {status === 'ONLINE' && metrics.mspt !== undefined
                ? `${metrics.mspt.toFixed(1)} ms`
                : t('overview.metrics.mspt')}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] dark:bg-[#1f1f1f] rounded-[2px] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                status !== 'ONLINE'
                  ? 'bg-transparent'
                  : (metrics.tps ?? 20) >= 19.5
                  ? 'bg-[#50e3c2]'
                  : (metrics.tps ?? 20) >= 15
                  ? 'bg-[#f5a623]'
                  : 'bg-[#ee0000]'
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
        <div className="geist-card p-4 flex flex-col justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.players_online')}
            </span>
            <Users className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717] dark:text-[#ededed]">
              {players.length}
            </span>
            <span className="font-mono text-[12px] text-[#888888]">
              / {maxPlayersCount} Max
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[12px] text-[#4d4d4d] dark:text-[#a1a1a1]">
            <span>{t('overview.controls.address')}:</span>
            <span className="font-mono text-[#171717] dark:text-[#ededed]">localhost:{serverPort}</span>
          </div>
        </div>
      </div>

      {/* Lower Split Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Left Column: Connected Players Table/Cards */}
        <div className="col-span-5 geist-card flex flex-col overflow-hidden bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#ebebeb] dark:border-[#262626] flex items-center justify-between bg-[#fafafa]/50 dark:bg-[#141414]/50">
            <div>
              <h2 className="text-[14px] font-medium tracking-[-0.28px] text-[#171717] dark:text-[#ededed]">
                {t('overview.players.title')}
              </h2>
            </div>
            <span className="font-mono text-[12px] text-[#888888]">
              {players.length} online
            </span>
          </div>

          {/* Quick Player Search in Overview */}
          <div className="px-3 py-2 border-b border-[#ebebeb] dark:border-[#262626] bg-white dark:bg-[#0d0d0d] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#888888] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder={t('overview.players.search_placeholder')}
                className="w-full h-7 pl-8 pr-2.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
              />
            </div>
            {playerSearch && (
              <button
                type="button"
                onClick={() => setPlayerSearch('')}
                className="text-[11px] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] cursor-pointer"
              >
                {t('overview.players.clear_search')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb] dark:divide-[#262626]">
            {filteredOverviewPlayers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <p className="text-[14px] font-medium text-[#171717] dark:text-[#ededed]">
                  {playerSearch ? t('overview.players.no_matches') : t('overview.players.empty')}
                </p>
                <p className="text-[13px] text-[#888888] mt-1 max-w-xs">
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
                    className="p-4 hover:bg-[#fafafa] dark:hover:bg-[#141414] transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://mc-heads.net/avatar/${p.username}/40`}
                          alt={p.username}
                          className="w-9 h-9 rounded-[6px] border border-[#ebebeb] dark:border-[#262626]"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[14px] font-medium tracking-[-0.28px] text-[#171717] dark:text-[#ededed]">
                              {p.username}
                            </span>
                            {p.isOp && (
                              <span className="px-1 py-0.2 rounded-[3px] bg-[#f5a623]/15 border border-[#f5a623]/30 text-[#f5a623] font-mono text-[9px] font-bold">
                                {t('overview.players.operator')}
                              </span>
                            )}
                            {p.isFrozen && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-[#0070f3]/15 border border-[#0070f3]/30 text-[#0070f3] dark:text-[#3291ff] font-mono text-[9px] font-bold">
                                <Snowflake className="w-2.5 h-2.5" />
                                {t('players.frozen')}
                              </span>
                            )}
                            {p.isMuted && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-[#ee0000]/15 border border-[#ee0000]/30 text-[#ee0000] font-mono text-[9px] font-bold">
                                <VolumeX className="w-2.5 h-2.5" />
                                {t('players.muted')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#888888] flex-wrap">
                            <span>XYZ: {p.x}, {p.y}, {p.z}</span>
                            {p.ping !== undefined && (
                              <>
                                <span>&bull;</span>
                                <span className="inline-flex items-center gap-0.5 text-[#50e3c2]">
                                  <Wifi className="w-2.5 h-2.5" />
                                  {p.ping}ms
                                </span>
                              </>
                            )}
                            {p.health !== undefined && (
                              <>
                                <span>&bull;</span>
                                <span className="inline-flex items-center gap-0.5 text-[#ee0000]">
                                  <Heart className="w-2.5 h-2.5 fill-[#ee0000]" />
                                  {p.health} HP
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] text-[#4d4d4d] dark:text-[#a1a1a1]">
                        <DimensionIcon dimension={p.dimension} className="w-3.5 h-3.5" />
                        {dimLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      {onInspectInventory && (
                        <button
                          type="button"
                          onClick={() => onInspectInventory(p)}
                          className="flex-1 h-7 rounded-[6px] bg-[#0070f3]/10 dark:bg-[#0070f3]/15 hover:bg-[#0070f3]/20 border border-[#0070f3]/30 text-[11px] font-medium text-[#0070f3] dark:text-[#3291ff] flex items-center justify-center gap-1 transition-colors cursor-pointer px-1 whitespace-nowrap overflow-hidden shadow-2xs"
                          title={t('players.inspect_inventory')}
                        >
                          <PackageSearch className="w-3 h-3 shrink-0" />
                          <SlidingText>{t('players.actions.inventory_short')}</SlidingText>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'HEAL' })}
                        className="flex-1 h-7 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#0070f3]/40 text-[11px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-1 transition-colors cursor-pointer px-1 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('overview.players.feed')}
                      >
                        <Heart className="w-3 h-3 text-[#0070f3] dark:text-[#50e3c2] shrink-0" />
                        <SlidingText>{t('overview.players.feed')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'GIFT' })}
                        className="flex-1 h-7 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#0070f3]/40 text-[11px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-1 transition-colors cursor-pointer px-1 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('players.actions.gift')}
                      >
                        <Gift className="w-3 h-3 text-[#0070f3] shrink-0" />
                        <SlidingText>{t('players.actions.gift')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'DAMAGE' })}
                        className="flex-1 h-7 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#ee0000]/40 text-[11px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-1 transition-colors cursor-pointer px-1 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('players.actions.hurt')}
                      >
                        <Zap className="w-3 h-3 text-[#ee0000] dark:text-[#ff6b6b] shrink-0" />
                        <SlidingText>{t('players.actions.hurt')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayerAction(p.username, 'KILL')}
                        className="flex-1 h-7 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fff0f0] dark:hover:bg-[#381215] border border-[#ebebeb] dark:border-[#262626] hover:border-[#ee0000]/40 text-[11px] font-medium text-[#ee0000] flex items-center justify-center gap-1 transition-colors cursor-pointer px-1 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('players.actions.kill')}
                      >
                        <Skull className="w-3 h-3 shrink-0" />
                        <SlidingText>{t('players.actions.kill')}</SlidingText>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayerAction(p.username, 'KICK')}
                        className="flex-1 h-7 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#888888]/40 text-[11px] font-medium text-[#4d4d4d] dark:text-[#a1a1a1] flex items-center justify-center gap-1 transition-colors cursor-pointer px-1 whitespace-nowrap overflow-hidden shadow-2xs"
                        title={t('overview.players.kick')}
                      >
                        <LogOut className="w-3 h-3 shrink-0" />
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
        <div className="col-span-7 rounded-[8px] bg-[#171717] dark:bg-[#0a0a0a] border border-[#2e2e2e] dark:border-[#262626] text-white flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#2e2e2e] dark:border-[#262626] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#888888]" />
              <span className="font-mono text-[12px] text-[#f2f2f2]">
                stdout — server.jar
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {QUICK_COMMANDS.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => onSendCommand(item.cmd)}
                  className="px-2 py-0.5 rounded-[4px] bg-[#262626] dark:bg-[#1a1a1a] hover:bg-[#333333] dark:hover:bg-[#262626] font-mono text-[11px] text-[#a1a1a1] hover:text-white transition cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-[20px] space-y-1">
            {logs.length === 0 ? (
              <div className="text-[#888888]">
                Ready. Awaiting process output stream...
              </div>
            ) : (
              logs.map((line, idx) => (
                <div
                  key={idx}
                  className={`break-all ${
                    line.includes('WARN')
                      ? 'text-[#f5a623]'
                      : line.includes('ERROR')
                      ? 'text-[#ee0000]'
                      : line.startsWith('>')
                      ? 'text-[#50e3c2]'
                      : 'text-[#e5e5e5]'
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
            className="p-2.5 border-t border-[#2e2e2e] dark:border-[#262626] bg-[#111111] dark:bg-[#070707] flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4 text-[#888888] ml-1" />
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={t('overview.console.placeholder')}
              className="flex-1 bg-transparent font-mono text-[13px] text-white placeholder-[#888888] focus:outline-none"
            />
            <button
              type="submit"
              className="h-7 px-3 rounded-[6px] bg-white hover:bg-[#e5e5e5] text-[#171717] text-[12px] font-medium transition cursor-pointer"
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
