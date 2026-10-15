import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { useGameLogoUrl } from './gameLogoStore';

/**
 * Logo of a game. The image always comes from the game's pack (`/api/games/:id/logo`); until it is
 * available, or for packs without a logo, a neutral icon is shown. No game is special-cased here.
 */
export const GameLogo: React.FC<{ gameId: string; className?: string; size?: number }> = ({
  gameId,
  className = '',
  size = 28
}) => {
  const packLogo = useGameLogoUrl(gameId);
  if (packLogo) {
    return (
      <img
        src={packLogo}
        alt={gameId}
        width={size}
        height={size}
        className={`shrink-0 object-contain select-none pointer-events-none ${className}`}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[6px] bg-surface-3 text-mute ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Gamepad2 style={{ width: size * 0.6, height: size * 0.6 }} />
    </span>
  );
};
