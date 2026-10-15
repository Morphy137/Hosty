import React from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Monitor } from 'lucide-react';
import type { GameDriverSummary } from '../../types/daemon';

interface ServerIconHintProps {
  game: Pick<GameDriverSummary, 'name' | 'serverIcon'> | undefined;
}

/** Explains where the icon is used: in the game too (with its size rules) or only inside Hosty. */
export const ServerIconHint: React.FC<ServerIconHintProps> = ({ game }) => {
  const { t } = useTranslation();
  const spec = game?.serverIcon;
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-mute">
      {spec ? (
        <>
          <Gamepad2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{t('server_icon.hint_game', { game: game?.name ?? '', file: spec.file, size: spec.size })}</span>
        </>
      ) : (
        <>
          <Monitor className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{t('server_icon.hint_app', { game: game?.name ?? '' })}</span>
        </>
      )}
    </p>
  );
};
