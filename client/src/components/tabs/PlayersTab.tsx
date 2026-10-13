import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Search,
  Settings2,
  Heart,
  Gift,
  Zap,
  Skull
} from 'lucide-react';
import type { PlayerState } from '../../types/daemon';
import { PlayerAdminModal } from '../modals/PlayerAdminModal';
import { buildPlayerCommand, type PlayerAction } from '../../utils/playerCommands';

interface PlayersTabProps {
  players: PlayerState[];
  onSendCommand: (command: string) => void;
}

const DIMENSION_STYLES: Record<string, { key: string; dot: string }> = {
  overworld: { key: 'overview.players.dimension.overworld', dot: 'bg-[#0070f3]' },
  the_nether: { key: 'overview.players.dimension.the_nether', dot: 'bg-[#ee0000]' },
  the_end: { key: 'overview.players.dimension.the_end', dot: 'bg-[#7928ca]' }
};

export const PlayersTab: React.FC<PlayersTabProps> = ({ players, onSendCommand }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerState | null>(null);

  const filteredPlayers = players.filter((p) =>
    p.username.toLowerCase().includes(filter.toLowerCase())
  );

  const handlePlayerAction = (username: string, action: PlayerAction) => {
    const cmd = buildPlayerCommand(action, username, 'Kicked by administrator');
    onSendCommand(cmd);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-4 max-w-[1200px] w-full mx-auto">
      {/* Top Bar with Search and Online Count */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-80">
            <Search className="w-4 h-4 text-[#888888] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('players.search_placeholder')}
              className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white border border-[#ebebeb] text-[14px] text-[#171717] placeholder-[#888888] focus:outline-none focus:border-[#171717]"
            />
          </div>
          <span className="font-mono text-[12px] text-[#888888]">
            {players.length} {t('overview.metrics.players_online')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSendCommand('list')}
          className="h-9 px-4 rounded-[6px] bg-white hover:bg-[#fafafa] border border-[#ebebeb] text-[13px] font-medium text-[#4d4d4d] flex items-center gap-1.5 transition cursor-pointer"
        >
          <Users className="w-4 h-4 text-[#888888]" />
          {t('players.refresh_list')}
        </button>
      </div>

      {/* Players Cards Grid */}
      <div className="flex-1 overflow-y-auto">
        {filteredPlayers.length === 0 ? (
          <div className="geist-card h-64 flex flex-col items-center justify-center p-8 text-center">
            <Users className="w-8 h-8 text-[#a1a1a1] mb-2" />
            <p className="text-[14px] font-medium text-[#171717]">
              {t('overview.players.empty')}
            </p>
            <p className="text-[13px] text-[#888888] mt-1 max-w-sm">
              {t('players.empty_description')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filteredPlayers.map((player) => {
              const dimStyle = DIMENSION_STYLES[player.dimension] || {
                key: 'overview.players.dimension.overworld',
                dot: 'bg-[#888888]'
              };
              const dimLabel = t(dimStyle.key, { defaultValue: player.dimension });

              return (
                <div
                  key={player.username}
                  className="geist-card p-4 flex flex-col justify-between hover:border-[#171717]/20 transition space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://mc-heads.net/avatar/${player.username}/48`}
                        alt={player.username}
                        className="w-12 h-12 rounded-[6px] border border-[#ebebeb] shrink-0"
                      />
                      <div>
                        <div className="text-[15px] font-semibold text-[#171717] tracking-[-0.3px]">
                          {player.username}
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#fafafa] border border-[#ebebeb] font-mono text-[11px] text-[#4d4d4d] mt-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${dimStyle.dot}`} />
                          {dimLabel}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(player)}
                      className="p-1.5 rounded-[6px] hover:bg-[#f5f5f5] text-[#888888] hover:text-[#171717] transition cursor-pointer"
                      title={t('players.manage_title')}
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Coordinates */}
                  <div className="p-2 rounded-[6px] bg-[#fafafa] border border-[#ebebeb] font-mono text-[12px] flex items-center justify-around text-[#4d4d4d]">
                    <span>X: {player.x}</span>
                    <span className="text-[#ebebeb]">|</span>
                    <span>Y: {player.y}</span>
                    <span className="text-[#ebebeb]">|</span>
                    <span>Z: {player.z}</span>
                  </div>

                  {/* Quick Player Actions */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePlayerAction(player.username, 'HEAL')}
                      className="h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[11px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                      title={t('overview.players.feed')}
                    >
                      <Heart className="w-3 h-3 text-[#ee0000]" />
                      Heal
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePlayerAction(player.username, 'GIFT')}
                      className="h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[11px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Give 5 Diamonds"
                    >
                      <Gift className="w-3 h-3 text-[#0070f3]" />
                      Gift
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePlayerAction(player.username, 'DAMAGE')}
                      className="h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[11px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Hurt Player"
                    >
                      <Zap className="w-3 h-3 text-[#f5a623]" />
                      Hurt
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePlayerAction(player.username, 'KILL')}
                      className="h-7 rounded-[4px] bg-white hover:bg-[#f7d4d6]/40 border border-[#ebebeb] text-[11px] font-medium text-[#ee0000] flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Kill Player"
                    >
                      <Skull className="w-3 h-3" />
                      Kill
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
        />
      )}
    </div>
  );
};
