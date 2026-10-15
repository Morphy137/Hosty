import { useSyncExternalStore } from 'react';

/** Logo URLs of game packs, registered when the game list loads (built-in games ship bundled art). */
let logos: Record<string, string> = {};
const listeners = new Set<() => void>();

export function registerGameLogos(next: Record<string, string>): void {
  const changed = Object.keys(next).length !== Object.keys(logos).length || Object.entries(next).some(([id, url]) => logos[id] !== url);
  if (!changed) return;
  logos = next;
  listeners.forEach((listener) => listener());
}

export function useGameLogoUrl(gameId: string): string | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => logos[gameId],
    () => undefined
  );
}
