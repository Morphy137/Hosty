import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerActionSpec, PlayerState } from '../../types/daemon';
import { renderPlayerCommand } from '../../utils/playerActions';
import { resolveLocalized } from '../../utils/localized';
import { cn } from '../../utils/cn';
import { PlayerActionDialog } from './PlayerActionDialog';

interface PlayerActionButtonsProps {
  player: PlayerState;
  actions: PlayerActionSpec[];
  onExecute: (command: string) => void;
}

/** One button per declared action; parameterless actions run immediately, others open a form. */
export const PlayerActionButtons: React.FC<PlayerActionButtonsProps> = ({ player, actions, onExecute }) => {
  const { i18n } = useTranslation();
  const [pending, setPending] = useState<PlayerActionSpec | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() =>
              action.params?.length ? setPending(action) : onExecute(renderPlayerCommand(action, player.username))
            }
            className={cn(
              'h-7 cursor-pointer rounded-[6px] border border-hairline bg-surface px-2.5 text-[11px] font-medium shadow-2xs transition-colors hover:bg-surface-3',
              action.danger ? 'text-danger-fg' : 'text-ink'
            )}
          >
            {resolveLocalized(action.label, i18n.language) ?? action.id}
          </button>
        ))}
      </div>
      {pending && (
        <PlayerActionDialog player={player} action={pending} onClose={() => setPending(null)} onExecute={onExecute} />
      )}
    </>
  );
};
