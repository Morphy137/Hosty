import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerActionSpec, PlayerState } from '../../types/daemon';
import { actionIcon } from '../../utils/actionIcons';
import { resolveLocalized } from '../../utils/localized';
import { cn } from '../../utils/cn';
import { SlidingText } from '../common/SlidingText';
import { PlayerActionDialog, type RunPlayerAction } from './PlayerActionDialog';

interface PlayerActionButtonsProps {
  player: PlayerState;
  actions: PlayerActionSpec[];
  onRun: RunPlayerAction;
  /** `row`: equal-width buttons on one line (cards); `grid`: wrapping list (player menu). */
  layout?: 'row' | 'grid';
}

/** One button per declared action; parameterless actions run immediately, others open a form. */
export const PlayerActionButtons: React.FC<PlayerActionButtonsProps> = ({ player, actions, onRun, layout = 'grid' }) => {
  const { i18n } = useTranslation();
  const [pending, setPending] = useState<PlayerActionSpec | null>(null);

  return (
    <>
      <div className={cn(layout === 'row' ? 'flex items-center gap-1.5' : 'grid grid-cols-2 gap-1.5 sm:grid-cols-3')}>
        {actions.map((action) => {
          const Icon = actionIcon(action.icon);
          const label = resolveLocalized(action.label, i18n.language) ?? action.id;
          return (
            <button
              key={action.id}
              type="button"
              title={label}
              onClick={() => (action.params?.length ? setPending(action) : onRun(action.id, player.username))}
              className={cn(
                'flex h-7 min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[6px] border border-hairline bg-surface text-[11px] font-medium shadow-2xs transition-colors hover:bg-surface-3',
                layout === 'row' ? 'flex-1 justify-center px-1.5' : 'justify-start px-2.5',
                action.danger ? 'text-danger-fg hover:border-danger/40' : 'text-ink'
              )}
            >
              <Icon className="h-[11px] w-[11px] shrink-0" />
              <SlidingText>{label}</SlidingText>
            </button>
          );
        })}
      </div>
      {pending && <PlayerActionDialog player={player} action={pending} onClose={() => setPending(null)} onRun={onRun} />}
    </>
  );
};
