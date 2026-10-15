import type { GameDriverSummary } from '../types/daemon';

export type TabId = 'overview' | 'players' | 'mod_files' | 'mods' | 'properties' | 'backups';

const ALL_TABS: TabId[] = ['overview', 'players', 'mod_files', 'mods', 'properties', 'backups'];

/**
 * Tabs a server exposes, derived only from the driver's declared capabilities and config files.
 * Unknown drivers (summary not loaded yet) get the full set so nothing flickers away.
 */
export function availableTabs(game: GameDriverSummary | undefined): TabId[] {
  if (!game) return ALL_TABS;
  return ALL_TABS.filter((tab) => {
    if (tab === 'players') return game.capabilities.players;
    if (tab === 'mod_files' || tab === 'mods') return game.capabilities.mods;
    if (tab === 'properties') return game.capabilities.configEditor && game.configFiles.length > 0;
    return true;
  });
}

/** Falls back to the overview when the selected tab does not exist for the current server. */
export function resolveActiveTab(active: TabId, tabs: TabId[]): TabId {
  return tabs.includes(active) ? active : 'overview';
}
