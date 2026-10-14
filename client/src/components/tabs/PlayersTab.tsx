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
  PackageSearch
} from 'lucide-react';
import type { DaemonAction, PlayerState } from '../../types/daemon';
import { PlayerAdminModal } from '../modals/PlayerAdminModal';
import { PlayerActionModal, type DynamicActionType } from '../modals/PlayerActionModal';
import { DimensionIcon } from '../common/DimensionIcon';
import { buildPlayerCommand, type PlayerAction } from '../../utils/playerCommands';
import { formatDimensionName, normalizeDimension } from '../../utils/format';
import { SlidingText } from '../common/SlidingText';

interface PlayersTabProps {
  players: PlayerState[];
  onSendCommand: (command: string) => void;
  onSendAction?: (action: DaemonAction, data?: unknown) => boolean;
  onInspectInventory?: (player: PlayerState) => void;
}

type DimensionFilter = string;

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
            <Search className="w-4 h-4 text-[#888888] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('players.search_placeholder')}
              className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[13px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
          </div>

          {/* Dimension Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedDimension('all')}
              className={`h-8 px-2.5 rounded-[4px] text-[12px] font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                selectedDimension === 'all'
                  ? 'bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#000000] shadow-2xs'
                  : 'bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626]'
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
                  ? 'bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#000000] shadow-2xs'
                  : 'bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626]'
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
                  ? 'bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#000000] shadow-2xs'
                  : 'bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626]'
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
                  ? 'bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#000000] shadow-2xs'
                  : 'bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626]'
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
                      ? 'bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#000000] shadow-2xs'
                      : 'bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626]'
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
          className="h-8 px-3 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#4d4d4d] dark:text-[#a1a1a1] flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
        >
          <Users className="w-3.5 h-3.5 text-[#888888]" />
          <SlidingText>{t('players.refresh_list')}</SlidingText>
        </button>
      </div>

      {/* Players Responsive Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredPlayers.length === 0 ? (
          <div className="geist-card h-64 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
            <Users className="w-8 h-8 text-[#a1a1a1] dark:text-[#707070] mb-2" />
            <p className="text-[14px] font-medium text-[#171717] dark:text-[#ededed]">
              {t('overview.players.empty')}
            </p>
            <p className="text-[13px] text-[#888888] mt-1 max-w-sm">
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
                  className="geist-card p-3.5 flex flex-col justify-between hover:border-[#171717]/30 dark:hover:border-[#ededed]/30 transition space-y-3 bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626] shadow-2xs"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={`https://mc-heads.net/avatar/${player.username}/40`}
                        alt={player.username}
                        className="w-10 h-10 rounded-[6px] border border-[#ebebeb] dark:border-[#262626] shrink-0 object-contain shadow-2xs"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-semibold text-[#171717] dark:text-[#ededed] tracking-[-0.2px] truncate">
                            {player.username}
                          </span>
                          {player.isOp && (
                            <span className="px-1 py-0.2 rounded-[3px] bg-[#f5a623]/15 border border-[#f5a623]/30 text-[#f5a623] font-mono text-[9px] font-bold">
                              {t('overview.players.operator')}
                            </span>
                          )}
                          {player.isFrozen && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-[#0070f3]/15 border border-[#0070f3]/30 text-[#0070f3] dark:text-[#3291ff] font-mono text-[9px] font-bold">
                              <Snowflake className="w-2.5 h-2.5" />
                              {t('players.frozen')}
                            </span>
                          )}
                          {player.isMuted && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-[3px] bg-[#ee0000]/15 border border-[#ee0000]/30 text-[#ee0000] font-mono text-[9px] font-bold">
                              <VolumeX className="w-2.5 h-2.5" />
                              {t('players.muted')}
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[10px] text-[#4d4d4d] dark:text-[#a1a1a1] mt-0.5">
                          <DimensionIcon dimension={player.dimension} className="w-3 h-3" />
                          <span className="truncate">{dimLabel}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {onInspectInventory && (
                        <button
                          type="button"
                          onClick={() => onInspectInventory(player)}
                          className="p-1 rounded-[4px] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] text-[#0070f3] dark:text-[#3291ff] transition cursor-pointer"
                          title={t('players.inspect_inventory')}
                        >
                          <PackageSearch className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPlayer(player)}
                        className="p-1 rounded-[4px] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] transition cursor-pointer"
                        title={t('players.manage_title')}
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Coordinates Badge */}
                  <div className="px-2 py-1 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] flex items-center justify-around text-[#4d4d4d] dark:text-[#a1a1a1]">
                    <span>X: {player.x}</span>
                    <span className="text-[#ebebeb] dark:text-[#333333]">|</span>
                    <span>Y: {player.y}</span>
                    <span className="text-[#ebebeb] dark:text-[#333333]">|</span>
                    <span>Z: {player.z}</span>
                  </div>

                  {/* High-frequency Telemetry (Health, Food, Ping) */}
                  {(player.health !== undefined || player.ping !== undefined) && (
                    <div className="px-2 py-1 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] flex items-center justify-between text-[#4d4d4d] dark:text-[#a1a1a1]">
                      {player.health !== undefined && (
                        <span className="inline-flex items-center gap-1 text-[#ee0000]">
                          <Heart className="w-3 h-3 fill-[#ee0000]" />
                          <span>{player.health}/{player.maxHealth || 20} HP</span>
                        </span>
                      )}
                      {player.food !== undefined && (
                        <span className="text-[#888888]">
                          {t('overview.players.food')}: {player.food}/20
                        </span>
                      )}
                      {player.ping !== undefined && (
                        <span className="inline-flex items-center gap-1 text-[#50e3c2]">
                          <Wifi className="w-3 h-3" />
                          <span>{player.ping}ms</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick Player Actions */}
                  <div className="grid grid-cols-4 gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setActionTarget({ player, type: 'HEAL' })}
                      className="h-6.5 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[10px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-0.5 transition cursor-pointer px-1 whitespace-nowrap overflow-hidden"
                      title={t('overview.players.feed')}
                    >
                      <Heart className="w-2.5 h-2.5 text-[#ee0000] shrink-0" />
                      <SlidingText>{t('overview.players.feed')}</SlidingText>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActionTarget({ player, type: 'GIFT' })}
                      className="h-6.5 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[10px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-0.5 transition cursor-pointer px-1 whitespace-nowrap overflow-hidden"
                      title="Gift Items"
                    >
                      <Gift className="w-2.5 h-2.5 text-[#0070f3] shrink-0" />
                      <SlidingText>Gift</SlidingText>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActionTarget({ player, type: 'DAMAGE' })}
                      className="h-6.5 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[10px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-0.5 transition cursor-pointer px-1 whitespace-nowrap overflow-hidden"
                      title="Hurt Player"
                    >
                      <Zap className="w-2.5 h-2.5 text-[#f5a623] shrink-0" />
                      <SlidingText>Hurt</SlidingText>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePlayerAction(player.username, 'KILL')}
                      className="h-6.5 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#f7d4d6]/40 dark:hover:bg-[#381215] border border-[#ebebeb] dark:border-[#262626] text-[10px] font-medium text-[#ee0000] flex items-center justify-center gap-0.5 transition cursor-pointer px-1 whitespace-nowrap overflow-hidden"
                      title="Kill Player"
                    >
                      <Skull className="w-2.5 h-2.5 shrink-0" />
                      <SlidingText>Kill</SlidingText>
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
