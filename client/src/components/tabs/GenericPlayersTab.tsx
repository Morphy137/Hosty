import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Users } from 'lucide-react';
import type { DaemonAction, PlayerActionSpec, PlayerState, PlayerView } from '../../types/daemon';
import { formatDimensionName } from '../../utils/format';
import { playerAvatarUrl } from '../../utils/playerActions';
import { PlayerActionButtons } from '../players/PlayerActionButtons';

export interface PlayersPanelProps {
  players: PlayerState[];
  onSendCommand: (command: string) => void;
  onSendAction?: (action: DaemonAction, data?: unknown) => boolean;
  onInspectInventory?: (player: PlayerState) => void;
  playerActions: PlayerActionSpec[];
  playerView?: PlayerView;
}

/** Game-agnostic players list: what is shown and which actions exist come from the game's manifest. */
export const GenericPlayersTab: React.FC<PlayersPanelProps> = ({ players, onSendCommand, playerActions, playerView }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const visible = players.filter((player) => player.username.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden">
      <div className="relative w-72 shrink-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
        <input
          type="text"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('players.search_placeholder')}
          className="h-9 w-full rounded-[6px] border border-hairline bg-surface pl-9 pr-3 text-[13px] text-ink placeholder-mute focus:border-ink focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <div className="geist-card flex h-64 flex-col items-center justify-center border border-hairline bg-surface p-8 text-center">
            <Users className="mb-2 h-8 w-8 text-mute" />
            <p className="text-[14px] font-medium text-ink">{t('overview.players.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((player) => {
              const avatar = playerAvatarUrl(playerView?.avatarUrl, player.username);
              return (
                <div key={player.username} className="geist-card space-y-3 border border-hairline bg-surface p-3.5 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    {avatar ? (
                      <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-[6px] border border-hairline" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-surface-3 text-[14px] font-semibold text-ink">
                        {player.username.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink">{player.username}</div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-mute">
                        {playerView?.dimensions && <span>{formatDimensionName(player.dimension, t)}</span>}
                        {playerView?.coordinates && (
                          <span>
                            {player.x}, {player.y}, {player.z}
                          </span>
                        )}
                        {playerView?.vitals && player.health !== undefined && <span>{player.health} HP</span>}
                        {player.ping !== undefined && <span>{player.ping}ms</span>}
                      </div>
                    </div>
                  </div>
                  {playerActions.length > 0 && (
                    <PlayerActionButtons player={player} actions={playerActions} onExecute={onSendCommand} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
