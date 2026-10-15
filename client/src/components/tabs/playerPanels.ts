import type React from 'react';
import { PlayersTab } from './PlayersTab';
import type { PlayersPanelProps } from './GenericPlayersTab';

/**
 * Rich players panels bundled with the app. A game opts in with `playerPanel: "<id>"` in its (bundled)
 * manifest; every other game gets the generic list built from its declared `playerActions`.
 */
export const PLAYER_PANELS: Record<string, React.ComponentType<PlayersPanelProps>> = {
  'minecraft-players': PlayersTab
};
