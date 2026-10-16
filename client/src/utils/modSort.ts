import type { ModFileInfo } from '../types/daemon';

export const MOD_SORTS = ['name_asc', 'name_desc', 'newest', 'oldest', 'size_desc', 'size_asc', 'enabled_first'] as const;
export type ModSort = (typeof MOD_SORTS)[number];
export const DEFAULT_MOD_SORT: ModSort = 'name_asc';

const byName = (a: ModFileInfo, b: ModFileInfo): number =>
  a.originalName.localeCompare(b.originalName, undefined, { sensitivity: 'base', numeric: true });
const byDate = (a: ModFileInfo, b: ModFileInfo): number => Date.parse(a.modifiedAt) - Date.parse(b.modifiedAt);

const COMPARATORS: Record<ModSort, (a: ModFileInfo, b: ModFileInfo) => number> = {
  name_asc: byName,
  name_desc: (a, b) => byName(b, a),
  newest: (a, b) => byDate(b, a) || byName(a, b),
  oldest: (a, b) => byDate(a, b) || byName(a, b),
  size_desc: (a, b) => b.sizeBytes - a.sizeBytes || byName(a, b),
  size_asc: (a, b) => a.sizeBytes - b.sizeBytes || byName(a, b),
  enabled_first: (a, b) => Number(b.enabled) - Number(a.enabled) || byName(a, b)
};

/** A sorted copy of `files`; ties fall back to the name so the order is stable. */
export function sortModFiles(files: ModFileInfo[], sort: ModSort): ModFileInfo[] {
  return [...files].sort(COMPARATORS[sort]);
}

export const isModSort = (value: unknown): value is ModSort =>
  typeof value === 'string' && (MOD_SORTS as readonly string[]).includes(value);
