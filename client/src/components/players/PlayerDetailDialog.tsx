import React from 'react';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import type { GameDriverSummary, PlayerState } from '../../types/daemon';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { PlayerActionButtons } from './PlayerActionButtons';
import { PlayerAvatar, PlayerBadges, PlayerFacts } from './PlayerInfo';
import type { RunPlayerAction } from './PlayerActionDialog';

interface PlayerDetailDialogProps {
  player: PlayerState;
  game: GameDriverSummary | undefined;
  onClose: () => void;
  onRunAction: RunPlayerAction;
  onInspectInventory?: (player: PlayerState) => void;
}

/** Everything the game lets an operator do to one player (its declared `playerActions`). */
export const PlayerDetailDialog: React.FC<PlayerDetailDialogProps> = ({
  player,
  game,
  onClose,
  onRunAction,
  onInspectInventory
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} size="md" title={t('players.manage_title')}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} game={game} size={48} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[16px] font-semibold text-ink">{player.username}</span>
              <PlayerBadges player={player} />
            </div>
            <PlayerFacts player={player} game={game} />
          </div>
          {onInspectInventory && (
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              leadingIcon={<Package className="h-3.5 w-3.5" />}
              onClick={() => onInspectInventory(player)}
            >
              {t('players.inventory_button')}
            </Button>
          )}
        </div>
        <PlayerActionButtons player={player} actions={game?.playerActions ?? []} onRun={onRunAction} />
      </div>
    </Dialog>
  );
};
