import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cpu,
  HardDrive,
  Users,
  Server,
  Settings,
  RotateCcw,
  Copy,
  Check,
  Layers,
  Search,
  Activity
} from 'lucide-react';
import type { GameDriverSummary, InstanceInfo, Metrics, PlayerState, ServerStatus } from '../../types/daemon';
import { PlayerCard } from '../players/PlayerCard';
import type { RunPlayerAction } from '../players/PlayerActionDialog';
import { calculateRamPercent, formatUptime } from '../../utils/format';
import { processLabel } from '../../utils/gameRuntime';
import { GameTag } from '../common/GameTag';
import { useShareableHost } from '../../hooks/useShareableHost';
import { flattenMotdLines, stripMotdCodes } from '../../utils/motd';
import { ServerAvatar } from '../common/ServerAvatar';
import { BridgeBadge, ServerStatusBadge } from '../common/ServerStatusBadge';
import { AnimatedNumber } from '../motion/AnimatedNumber';
import { Sparkline } from '../common/Sparkline';
import type { MetricsHistory } from '../../hooks/useMetricsHistory';
import { ConsolePanel } from '../console/ConsolePanel';
import { usePreferences } from '../../settings/preferencesContext';
import { resolveQuickCommands } from '../../utils/quickCommands';

interface OverviewTabProps {
  metrics: Metrics;
  players: PlayerState[];
  logs: string[];
  instance: InstanceInfo | null;
  status: ServerStatus;
  onSendCommand: (command: string) => void;
  onClearConsole?: () => void;
  onRunAction: RunPlayerAction;
  onOpenEditModal: () => void;
  onRestart: () => void;
  onInspectInventory?: (player: PlayerState) => void;
  history?: MetricsHistory;
  /** The instance's game: quick commands, player actions and what the Overview shows come from it. */
  game?: GameDriverSummary;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  metrics,
  players,
  logs,
  instance,
  status,
  onSendCommand,
  onClearConsole,
  onRunAction,
  onOpenEditModal,
  onRestart,
  onInspectInventory,
  history,
  game
}) => {
  const { t } = useTranslation();
  const [playerSearch, setPlayerSearch] = useState('');
  const [copiedIp, setCopiedIp] = useState(false);

  const ramPercent = calculateRamPercent(metrics.ramMb, metrics.maxRamMb);
  const gameName = game?.name;
  const terminalPrefs = usePreferences().preferences.terminal;
  const quickCommands = resolveQuickCommands(game?.quickCommands ?? [], game ? terminalPrefs.quickCommands[game.id] : undefined);
  const serverPort = instance?.port || game?.defaultPort || 0;
  const shareableHost = useShareableHost();
  const serverAddress = `${shareableHost}:${serverPort}`;
  // The game's message of the day as a clean description: formatting codes and line breaks removed.
  const motdText = instance?.motd ?? '';
  const serverDescription = flattenMotdLines(game?.motd?.colorCodes ? stripMotdCodes(motdText) : motdText);
  const maxPlayersCount = instance?.maxPlayers || game?.defaultMaxPlayers || 0;
  // Tick rate the game runs at (manifest `performance.tickRate`); only then is a TPS reading meaningful.
  const tickRate = game?.performance?.tickRate;
  const showTps = Boolean(tickRate) && metrics.tps !== undefined;
  const tps = metrics.tps ?? tickRate ?? 0;
  const tpsHealth = !tickRate ? 1 : tps / tickRate;

  const filteredOverviewPlayers = players.filter((p) =>
    p.username.toLowerCase().includes(playerSearch.toLowerCase())
  );

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
            {instance ? <ServerAvatar instance={instance} size={44} /> : <Server className="w-7 h-7 text-mute" />}
          </div>

          {/* Server Meta & Live Status: same pills as the header */}
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-semibold tracking-[-0.34px] text-ink truncate">
                {instance?.name || t('header.instance')}
              </h1>
              <ServerStatusBadge status={status} />
              <GameTag gameId={instance?.gameId ?? ''} name={gameName ?? instance?.gameId ?? ''} />
              {metrics.bridgeConnected && <BridgeBadge />}
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

              {instance?.loader && (
                <>
                  <span className="text-hairline-strong">|</span>
                  <span className="inline-flex items-center gap-1 text-body">
                    <Layers className="w-3.5 h-3.5 text-mute" />
                    <span>{`${instance.loader.toUpperCase()} ${instance.loaderVersion || ''}`.trim()}</span>
                  </span>
                </>
              )}

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
              {serverDescription ? (
                <span className="max-w-sm truncate text-soft" title={serverDescription}>
                  {serverDescription}
                </span>
              ) : (
                <span className="max-w-sm truncate text-mute">{t('overview.no_motd')}</span>
              )}
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
              <AnimatedNumber value={metrics.cpu} fractionDigits={0} suffix="%" />
            </span>
            <span className="font-mono text-[12px] text-mute">{processLabel(game)}</span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-surface-3 rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-ink transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.cpu)}%` }}
            />
          </div>
          <Sparkline className="mt-2" values={history?.cpu ?? []} max={100} />
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
              <AnimatedNumber value={metrics.ramMb} suffix=" MB" />
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
          <Sparkline className="mt-2" values={history?.ramPercent ?? []} max={100} />
        </div>

        {/* Performance (games that declare a tick rate and report TPS) or uptime */}
        {showTps ? (
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
                  : tpsHealth >= 0.975
                  ? 'text-success-fg'
                  : tpsHealth >= 0.75
                  ? 'text-warning'
                  : 'text-danger-fg'
              }`}
            >
              {status === 'ONLINE'
                ? tps.toFixed(1)
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
                  : tpsHealth >= 0.975
                  ? 'bg-success'
                  : tpsHealth >= 0.75
                  ? 'bg-warning'
                  : 'bg-danger'
              }`}
              style={{
                width: `${
                  status === 'ONLINE'
                    ? Math.min(100, tpsHealth * 100)
                    : 0
                }%`
              }}
            />
          </div>
        </div>
        ) : (
          <div className="geist-card p-4 flex flex-col justify-between bg-surface border border-hairline">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] uppercase text-mute">{t('overview.metrics.uptime')}</span>
              <Activity className="w-4 h-4 text-mute" />
            </div>
            <div className="mt-2 text-[24px] font-semibold tracking-[-0.96px] text-ink">
              {status === 'ONLINE' ? formatUptime(Math.floor(metrics.uptime / 1000)) : '--'}
            </div>
            <div className="mt-3 h-1.5 w-full" />
          </div>
        )}

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
              filteredOverviewPlayers.map((p) => (
                <PlayerCard
                  key={p.username}
                  player={p}
                  game={game}
                  variant="row"
                  onRunAction={onRunAction}
                  onInspectInventory={onInspectInventory}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Column: Console */}
        <ConsolePanel
          key={instance?.id ?? ''}
          className="col-span-7"
          logs={logs}
          instanceId={instance?.id ?? ''}
          quickCommands={quickCommands}
          onSendCommand={onSendCommand}
          onClear={onClearConsole}
        />
      </div>

    </>
  );
};
