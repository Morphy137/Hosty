import type { GameDriverSummary } from '../types/daemon';

export type TabId = 'overview' | 'players' | 'mod_files' | 'mods' | 'properties';

const ALL_TABS: TabId[] = ['overview', 'players', 'mod_files', 'mods', 'properties'];

/**
 * Tabs a server exposes, derived from the driver's capabilities instead of the game id.
 * Unknown drivers (summary not loaded yet) get the full Minecraft-style set so nothing flickers away.
 */
export function availableTabs(game: GameDriverSummary | undefined): TabId[] {
  if (!game) return ALL_TABS;
  return ALL_TABS.filter((tab) => {
    if (tab === 'mod_files' || tab === 'mods') return game.supportsMods;
    if (tab === 'properties') return game.configFileName === 'server.properties';
    return true;
  });
}

/** Falls back to the overview when the selected tab does not exist for the current server. */
export function resolveActiveTab(active: TabId, tabs: TabId[]): TabId {
  return tabs.includes(active) ? active : 'overview';
}
