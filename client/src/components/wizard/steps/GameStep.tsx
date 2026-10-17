import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { GameAvailability, GameDriverSummary } from '../../../types/daemon';
import { GameLogo } from '../../common/GameIcons';
import { Badge, type BadgeVariant } from '../../ui/Badge';
import { cn } from '../../../utils/cn';
import { resolveLocalized } from '../../../utils/localized';
import type { StepProps } from '../wizardTypes';

interface GameStepProps extends StepProps {
  games: GameDriverSummary[];
  onSelectGame: (game: GameDriverSummary) => void;
}

const STATUS_VARIANT: Record<GameAvailability, BadgeVariant> = {
  available: 'success',
  beta: 'warning',
  coming_soon: 'neutral'
};

export const GameStep: React.FC<GameStepProps> = ({ draft, disabled, games, onSelectGame }) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] uppercase text-mute">{t('create_server.game_engine_label')}</p>
      {games.length === 0 && (
        <div className="rounded-[8px] border border-dashed border-hairline-strong bg-surface-2 p-6 text-center">
          <p className="text-[13px] font-medium text-ink">{t('wizard.no_games_title')}</p>
          <p className="mt-1 text-[12px] text-soft">{t('wizard.no_games_desc')}</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        {games.map((game) => {
          const isSelected = draft.gameId === game.id;
          const isDisabled = disabled || game.status === 'coming_soon';
          return (
            <button
              key={game.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelectGame(game)}
              className={cn(
                'flex items-center justify-between gap-4 rounded-[8px] border p-4 text-left transition-colors',
                isSelected ? 'border-accent bg-info-soft' : 'border-hairline bg-surface',
                isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-hairline-strong'
              )}
            >
              <span className="flex min-w-0 items-center gap-3.5">
                <GameLogo gameId={game.id} size={36} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{game.name}</span>
                    <Badge variant={STATUS_VARIANT[game.status]}>{t(`wizard.game_status.${game.status}`)}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-soft">
                    {resolveLocalized(game.descriptionI18n, i18n.language) ?? game.description}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  isSelected ? 'border-accent bg-accent text-on-accent' : 'border-hairline-strong'
                )}
              >
                {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
