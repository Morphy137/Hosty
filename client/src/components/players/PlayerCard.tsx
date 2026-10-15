import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Settings2 } from 'lucide-react';
import type { GameDriverSummary, PlayerState } from '../../types/daemon';
import { cn } from '../../utils/cn';
import { PlayerActionButtons } from './PlayerActionButtons';
import { PlayerDetailDialog } from './PlayerDetailDialog';
import { PlayerAvatar, PlayerBadges, PlayerFacts } from './PlayerInfo';
import type { RunPlayerAction } from './PlayerActionDialog';

interface PlayerCardProps {
  player: PlayerState;
  game: GameDriverSummary | undefined;
  onRunAction: RunPlayerAction;
  onInspectInventory?: (player: PlayerState) => void;
  /** `card`: Players tab grid; `row`: compact list (Overview). */
  variant?: 'card' | 'row';
}

/** One online player: facts the game declares, its quick actions and a menu with every other action. */
export const PlayerCard: React.FC<PlayerCardProps> = ({ player, game, onRunAction, onInspectInventory, variant = 'card' }) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const actions = game?.playerActions ?? [];
  const quick = actions.filter((action) => action.quick);

  return (
    <div
      className={cn(
        'animate-in space-y-3 transition',
        variant === 'card'
          ? 'geist-card border border-hairline bg-surface p-3.5 shadow-2xs hover:border-ink/30'
          : 'p-4 hover:bg-surface-2'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <PlayerAvatar player={player} game={game} size={variant === 'card' ? 40 : 36} />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold tracking-[-0.2px] text-ink">{player.username}</span>
              <PlayerBadges player={player} />
            </div>
            <PlayerFacts player={player} game={game} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onInspectInventory && (
            <button
              type="button"
              onClick={() => onInspectInventory(player)}
              className="cursor-pointer rounded-[6px] p-1 text-mute transition-colors hover:bg-surface-3 hover:text-ink"
              title={t('players.inventory_button')}
              aria-label={t('players.inventory_button')}
            >
              <Package className="h-3.5 w-3.5" />
            </button>
          )}
          {actions.length > 0 && (
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="cursor-pointer rounded-[4px] p-1 text-mute transition hover:bg-surface-3 hover:text-ink"
              title={t('players.manage_title')}
              aria-label={t('players.manage_title')}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {quick.length > 0 && <PlayerActionButtons player={player} actions={quick} onRun={onRunAction} layout="row" />}

      {isMenuOpen && (
        <PlayerDetailDialog
          player={player}
          game={game}
          onClose={() => setIsMenuOpen(false)}
          onRunAction={onRunAction}
          onInspectInventory={onInspectInventory}
        />
      )}
    </div>
  );
};
