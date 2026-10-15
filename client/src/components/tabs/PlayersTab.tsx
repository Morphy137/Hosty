import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Users } from 'lucide-react';
import type { GameDriverSummary, PlayerState } from '../../types/daemon';
import { resolveDimension, type ResolvedDimension } from '../../utils/dimensions';
import { cn } from '../../utils/cn';
import { DimensionIcon } from '../common/DimensionIcon';
import { SlidingText } from '../common/SlidingText';
import { PlayerCard } from '../players/PlayerCard';
import type { RunPlayerAction } from '../players/PlayerActionDialog';

export interface PlayersTabProps {
  players: PlayerState[];
  game: GameDriverSummary | undefined;
  onSendCommand: (command: string) => void;
  onRunAction: RunPlayerAction;
  onInspectInventory?: (player: PlayerState) => void;
}

const chipClass = (active: boolean) =>
  cn(
    'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2.5 text-[12px] font-medium transition',
    active ? 'bg-ink text-on-ink shadow-2xs' : 'border border-hairline bg-surface text-body hover:bg-surface-2'
  );

/** Players of any game: what is shown and which actions exist come from the game's manifest. */
export const PlayersTab: React.FC<PlayersTabProps> = ({ players, game, onSendCommand, onRunAction, onInspectInventory }) => {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState('');
  const [selectedDimension, setSelectedDimension] = useState('all');
  const showDimensions = Boolean(game?.playerView?.dimensions);

  const resolved = useMemo(
    () => new Map(players.map((player) => [player.username, resolveDimension(game, player.dimension, i18n.language)])),
    [players, game, i18n.language]
  );

  // Declared "primary" dimensions are always offered; any other one appears while somebody is in it.
  const chips = useMemo(() => {
    if (!showDimensions) return [];
    const list = new Map<string, ResolvedDimension>();
    for (const spec of game?.dimensions ?? []) {
      if (spec.primary) list.set(spec.id.toLowerCase(), resolveDimension(game, spec.id, i18n.language));
    }
    for (const dimension of resolved.values()) {
      if (dimension.id && !list.has(dimension.id.toLowerCase())) list.set(dimension.id.toLowerCase(), dimension);
    }
    return [...list.values()];
  }, [showDimensions, game, resolved, i18n.language]);

  const visible = players.filter((player) => {
    const matchesSearch = player.username.toLowerCase().includes(filter.toLowerCase());
    const dimensionId = resolved.get(player.username)?.id.toLowerCase();
    return matchesSearch && (selectedDimension === 'all' || dimensionId === selectedDimension);
  });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            <input
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('players.search_placeholder')}
              className="h-9 w-full rounded-[6px] border border-hairline bg-surface pl-9 pr-3 text-[13px] text-ink placeholder-mute focus:border-ink focus:outline-none"
            />
          </div>

          {chips.length > 0 && (
            <div className="scrollbar-none flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
              <button type="button" onClick={() => setSelectedDimension('all')} className={chipClass(selectedDimension === 'all')}>
                <SlidingText>{t('players.filter_all')}</SlidingText>
                <span className="font-mono text-[11px] opacity-75">({players.length})</span>
              </button>
              {chips.map((dimension) => {
                const id = dimension.id.toLowerCase();
                const count = [...resolved.values()].filter((entry) => entry.id.toLowerCase() === id).length;
                return (
                  <button key={id} type="button" onClick={() => setSelectedDimension(id)} className={chipClass(selectedDimension === id)}>
                    <DimensionIcon dimension={dimension} className="h-3.5 w-3.5" />
                    <SlidingText>{dimension.label}</SlidingText>
                    <span className="font-mono text-[11px] opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {game?.listPlayersCommand && (
          <button
            type="button"
            onClick={() => onSendCommand(game.listPlayersCommand as string)}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-hairline bg-surface px-3 text-[12px] font-medium text-body shadow-2xs transition hover:bg-surface-2"
          >
            <Users className="h-3.5 w-3.5 text-mute" />
            <SlidingText>{t('players.refresh_list')}</SlidingText>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <div className="geist-card flex h-64 flex-col items-center justify-center border border-hairline bg-surface p-8 text-center">
            <Users className="mb-2 h-8 w-8 text-mute" />
            <p className="text-[14px] font-medium text-ink">{t('overview.players.empty')}</p>
            <p className="mt-1 max-w-sm text-[13px] text-mute">{t('players.empty_description')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((player) => (
              <PlayerCard
                key={player.username}
                player={player}
                game={game}
                onRunAction={onRunAction}
                onInspectInventory={onInspectInventory}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
