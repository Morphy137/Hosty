import { useEffect, useState } from 'react';
import { fetchSupportedGames } from '../api/daemonApi';
import type { GameDriverSummary, SocketConnectionState } from '../types/daemon';

/** Loads the game drivers the daemon supports; capabilities decide which tabs a server shows. */
export function useGames(connectionState: SocketConnectionState): GameDriverSummary[] {
  const [games, setGames] = useState<GameDriverSummary[]>([]);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchSupportedGames()
      .then((response) => {
        if (!ignore) setGames(response.games);
      })
      .catch(() => {
        // Advisory only: without drivers the UI falls back to the full tab set.
      });
    return () => {
      ignore = true;
    };
  }, [connectionState]);

  return games;
}
