import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Search,
  Settings2,
  Heart,
  Gift,
  Zap,
  Skull,
  Wifi,
  Snowflake,
  VolumeX,
  Package
} from 'lucide-react';
import type { PlayersPanelProps } from './GenericPlayersTab';
import type { PlayerState } from '../../types/daemon';
import { PlayerAdminModal } from '../modals/PlayerAdminModal';
import { PlayerActionModal, type DynamicActionType } from '../modals/PlayerActionModal';
import { DimensionIcon } from '../common/DimensionIcon';
import { buildPlayerCommand, type PlayerAction } from '../../utils/playerCommands';
import { formatDimensionName, normalizeDimension } from '../../utils/format';
import { SlidingText } from '../common/SlidingText';

type PlayersTabProps = PlayersPanelProps;

type DimensionFilter = string;

/** Rich Minecraft-style players panel (dimensions, vitals, gameplay actions). Registered in `playerPanels.ts`. */
export const PlayersTab: React.FC<PlayersTabProps> = ({
  players,
  onSendCommand,
  onSendAction,
  onInspectInventory
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [selectedDimension, setSelectedDimension] = useState<DimensionFilter>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerState | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    player: PlayerState;
    type: DynamicActionType;
  } | null>(null);

  const overworldCount = players.filter((p) => normalizeDimension(p.dimension) === 'overworld').length;
  const netherCount = players.filter((p) => normalizeDimension(p.dimension) === 'the_nether').length;
  const endCount = players.filter((p) => normalizeDimension(p.dimension) === 'the_end').length;

  const activeModDimensions = Array.from(
    new Set(
      players
        .map((p) => normalizeDimension(p.dimension))
        .filter((dim) => dim !== 'overworld' && dim !== 'the_nether' && dim !== 'the_end')
    )
  );

  const filteredPlayers = players.filter((p) => {
    const matchesSearch = p.username.toLowerCase().includes(filter.toLowerCase());
    const norm = normalizeDimension(p.dimension);
    const matchesDimension = selectedDimension === 'all' || norm === selectedDimension;
    return matchesSearch && matchesDimension;
  });

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-4 max-w-[1400px] w-full mx-auto">
      {/* Top Filter & Dimension Chip Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-64 shrink-0">
            <Search className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('players.search_placeholder')}
              className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-surface border border-hairline text-[13px] text-ink placeholder-mute focus:outline-none focus:border-ink"
            />
          </div>

          {/* Dimension Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedDimension('all')}
              className={`h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                selectedDimension === 'all'
                  ? 'bg-ink text-on-ink shadow-2xs'
                  : 'bg-surface hover:bg-surface-2 text-body border border-hairline'
              }`}
            >
              <SlidingText>{t('players.filter_all')}</SlidingText>
              <span className="font-mono text-[11px] opacity-75">({players.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedDimension('overworld')}
              className={`h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                selectedDimension === 'overworld'
                  ? 'bg-ink text-on-ink shadow-2xs'
                  : 'bg-surface hover:bg-surface-2 text-body border border-hairline'
              }`}
            >
              <DimensionIcon dimension="overworld" className="w-3.5 h-3.5" />
              <SlidingText>{t('overview.players.dimension.overworld')}</SlidingText>
              <span className="font-mono text-[11px] opacity-75">({overworldCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedDimension('the_nether')}
              className={`h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                selectedDimension === 'the_nether'
                  ? 'bg-ink text-on-ink shadow-2xs'
                  : 'bg-surface hover:bg-surface-2 text-body border border-hairline'
              }`}
            >
              <DimensionIcon dimension="the_nether" className="w-3.5 h-3.5" />
              <SlidingText>{t('overview.players.dimension.the_nether')}</SlidingText>
              <span className="font-mono text-[11px] opacity-75">({netherCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedDimension('the_end')}
              className={`h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                selectedDimension === 'the_end'
                  ? 'bg-ink text-on-ink shadow-2xs'
                  : 'bg-surface hover:bg-surface-2 text-body border border-hairline'
              }`}
            >
              <DimensionIcon dimension="the_end" className="w-3.5 h-3.5" />
              <SlidingText>{t('overview.players.dimension.the_end')}</SlidingText>
              <span className="font-mono text-[11px] opacity-75">({endCount})</span>
            </button>

            {activeModDimensions.map((modDim) => {
              const count = players.filter((p) => normalizeDimension(p.dimension) === modDim).length;
              const label = formatDimensionName(modDim, t);
              return (
                <button
                  key={modDim}
                  type="button"
                  onClick={() => setSelectedDimension(modDim)}
                  className={`h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    selectedDimension === modDim
                      ? 'bg-ink text-on-ink shadow-2xs'
                      : 'bg-surface hover:bg-surface-2 text-body border border-hairline'
                  }`}
                >
                  <DimensionIcon dimension={modDim} className="w-3.5 h-3.5" />
                  <SlidingText>{label}</SlidingText>
                  <span className="font-mono text-[11px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSendCommand('list')}
          className="h-8 px-3 rounded-[4px] bg-surface hover:bg-surface-2 border border-hairline text-[12px] font-medium text-body flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
        >
          <Users className="w-3.5 h-3.5 text-mute" />
          <SlidingText>{t('players.refresh_list')}</SlidingText>
        </button>
      </div>

      {/* Players Responsive Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredPlayers.length === 0 ? (
          <div className="geist-card h-64 flex flex-col items-center justify-center p-8 text-center bg-surface border border-hairline">
            <Users className="w-8 h-8 text-mute mb-2" />
            <p className="text-[14px] font-medium text-ink">
              {t('overview.players.empty')}
            </p>
            <p className="text-[13px] text-mute mt-1 max-w-sm">
              {t('players.empty_description')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredPlayers.map((player) => {
              const dimLabel = formatDimensionName(player.dimension, t);

              return (
                <div
                  key={player.username}
                  className="animate-in geist-card p-3.5 flex flex-col justify-between hover:border-ink/30 transition space-y-3 bg-surface border border-hairline shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={`https://mc-heads.net/avatar/${player.username}/40`}
                        alt={player.username}
                        className="w-10 h-10 rounded-[6px] border border-hairline shrink-0 object-contain shadow-2xs"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-semibold text-ink tracking-[-0.2px] truncate">
                            {player.username}
                          </span>
                          {player.isOp && (
                            <span className="px-1 py-0.2 rounded-[3px] bg-warning/15 border border-warning/30 text-warning font-mono text-[9px] font-bold">
                              {t('overview.players.operator')}
                            </span>
                          )}
                          {player.isFrozen && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-accent/15 border border-accent/30 text-accent-fg font-mono text-[9px] font-bold">
                              <Snowflake className="w-2.5 h-2.5" />
                              {t('players.frozen')}
                            </span>
                          )}
                          {player.isMuted && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-danger/15 border border-danger/30 text-danger-fg font-mono text-[9px] font-bold">
                              <VolumeX className="w-2.5 h-2.5" />
                              {t('players.muted')}
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-[3px] bg-surface-2 border border-hairline font-mono text-[10px] text-body mt-0.5">
                          <DimensionIcon dimension={player.dimension} className="w-3.5 h-3.5" />
                          <span className="truncate">{dimLabel}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {onInspectInventory && (
                        <button
                          type="button"
                          onClick={() => onInspectInventory(player)}
                          className="p-1 rounded-[6px] hover:bg-surface-3 text-mute hover:text-ink transition-colors cursor-pointer"
                          title={t('players.inventory_button')}
                        >
                          <Package className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPlayer(player)}
                        className="p-1 rounded-[4px] hover:bg-surface-3 text-mute hover:text-ink transition cursor-pointer"
                        title={t('players.manage_title')}
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Coordinates Badge */}
                  <div className="px-2 py-1 rounded-[4px] bg-surface-2 border border-hairline font-mono text-[11px] flex items-center justify-around text-body">
                    <span>X: {player.x}</span>
                    <span className="text-hairline-strong">|</span>
                    <span>Y: {player.y}</span>
                    <span className="text-hairline-strong">|</span>
                    <span>Z: {player.z}</span>
                  </div>

                  {/* High-frequency Telemetry (Health, Food, Ping) */}
                  {(player.health !== undefined || player.ping !== undefined) && (
                    <div className="px-2 py-1 rounded-[4px] bg-surface-2 border border-hairline font-mono text-[11px] flex items-center justify-between text-body">
                      {player.health !== undefined && (
                        <span className="inline-flex items-center gap-1 text-danger-fg">
                          <Heart className="w-3 h-3 fill-danger-fg" />
                          <span>{player.health}/{player.maxHealth || 20} HP</span>
                        </span>
                      )}
                      {player.food !== undefined && (
                        <span className="text-mute">
                          {t('overview.players.food')}: {player.food}/20
                        </span>
                      )}
                      {player.ping !== undefined && (
                        <span className="inline-flex items-center gap-1 text-success-fg">
                          <Wifi className="w-3 h-3" />
                          <span>{player.ping}ms</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick Player Actions */}
                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setActionTarget({ player, type: 'HEAL' })}
                      className="h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-danger/40 text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                      title={t('overview.players.feed')}
                    >
                      <Heart className="w-[11px] h-[11px] text-danger-fg shrink-0" />
                      <SlidingText>{t('overview.players.feed')}</SlidingText>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActionTarget({ player, type: 'GIFT' })}
                      className="h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-accent/40 text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                      title={t('players.actions.gift')}
                    >
                      <Gift className="w-[11px] h-[11px] text-accent-fg shrink-0" />
                      <SlidingText>{t('players.actions.gift')}</SlidingText>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActionTarget({ player, type: 'DAMAGE' })}
                      className="h-7 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline hover:border-warning/40 text-[11px] font-medium text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                      title={t('players.actions.hurt')}
                    >
                      <Zap className="w-[11px] h-[11px] text-warning shrink-0" />
                      <SlidingText>{t('players.actions.hurt')}</SlidingText>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePlayerAction(player.username, 'KILL')}
                      className="h-7 rounded-[6px] bg-surface hover:bg-danger-soft border border-hairline hover:border-danger/40 text-[11px] font-medium text-danger-fg flex items-center justify-center gap-1.5 transition-colors cursor-pointer px-1.5 whitespace-nowrap overflow-hidden shadow-2xs"
                      title={t('players.actions.kill')}
                    >
                      <Skull className="w-[11px] h-[11px] text-danger-fg shrink-0" />
                      <SlidingText>{t('players.actions.kill')}</SlidingText>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin Modal */}
      {selectedPlayer && (
        <PlayerAdminModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          onSendCommand={onSendCommand}
          onSendAction={onSendAction}
          onInspectInventory={onInspectInventory}
        />
      )}

      {/* Dynamic Action Modal */}
      {actionTarget && (
        <PlayerActionModal
          player={actionTarget.player}
          actionType={actionTarget.type}
          onClose={() => setActionTarget(null)}
          onExecute={onSendCommand}
        />
      )}
    </div>
  );
};
