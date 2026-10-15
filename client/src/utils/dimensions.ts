import type { DimensionSpec, GameDriverSummary } from '../types/daemon';
import { getGameFileUrl } from '../api/daemonApi';
import { resolveLocalized } from './localized';

export interface ResolvedDimension {
  /** Canonical id (the declared one when the game knows it, else the reported value). */
  id: string;
  label: string;
  iconUrl: string | null;
}

const prettify = (raw: string): string => {
  const path = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
  return path
    .split(/[_\-/]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || raw;
};

/** The declared dimension a reported value belongs to (by id or alias, case-insensitive). */
export function findDimension(game: Pick<GameDriverSummary, 'dimensions'> | undefined, raw: string): DimensionSpec | undefined {
  const value = (raw || '').trim().toLowerCase();
  return game?.dimensions?.find(
    (dimension) => dimension.id.toLowerCase() === value || dimension.aliases?.some((alias) => alias.toLowerCase() === value)
  );
}

/** Label and icon of a reported dimension, from the game's manifest (unknown ones get a readable name). */
export function resolveDimension(
  game: Pick<GameDriverSummary, 'id' | 'dimensions'> | undefined,
  raw: string,
  language: string
): ResolvedDimension {
  const declared = findDimension(game, raw);
  if (declared) {
    return {
      id: declared.id,
      label: resolveLocalized(declared.label, language) ?? declared.id,
      iconUrl: declared.icon && game ? getGameFileUrl(game.id, declared.icon) : null
    };
  }
  const value = (raw || '').trim();
  return { id: value.toLowerCase(), label: value ? prettify(value) : '—', iconUrl: null };
}
