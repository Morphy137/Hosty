import { useEffect, useState } from 'react';
import i18n from 'i18next';
import { fetchSupportedGames, getGameLogoUrl } from '../api/daemonApi';
import { registerGameLogos } from '../components/common/gameLogoStore';
import type { GameDriverSummary, SocketConnectionState } from '../types/daemon';

/** Loads the game drivers the daemon supports and wires their logos and translations into the UI. */
export function useGames(connectionState: SocketConnectionState, reloadKey = 0): GameDriverSummary[] {
  const [games, setGames] = useState<GameDriverSummary[]>([]);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchSupportedGames()
      .then((response) => {
        if (ignore) return;
        const logos: Record<string, string> = {};
        for (const game of response.games) {
          if (game.hasLogo) logos[game.id] = getGameLogoUrl(game.id);
          for (const [language, resources] of Object.entries(game.i18n ?? {})) {
            i18n.addResourceBundle(language, 'translation', resources, true, true);
          }
        }
        registerGameLogos(logos);
        setGames(response.games);
      })
      .catch(() => {
        // Advisory only: without drivers the UI falls back to the full tab set.
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, reloadKey]);

  return games;
}
