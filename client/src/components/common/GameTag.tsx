import React from 'react';
import { GameLogo } from './GameIcons';

const LOGO_SIZE_PX = 16;

/** The game an instance belongs to: its logo and name, with no frame (logo and name come from the game's pack). */
export const GameTag: React.FC<{ gameId: string; name: string }> = ({ gameId, name }) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-body">
    <GameLogo gameId={gameId} size={LOGO_SIZE_PX} />
    <span>{name}</span>
  </span>
);
