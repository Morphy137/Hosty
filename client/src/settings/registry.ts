import type { AppPreferences, PreferenceSection } from './schema';

export const SETTINGS_SECTIONS = ['general', 'appearance', 'terminal', 'servers', 'advanced'] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

/** Where a row is available: everywhere, only in the desktop app, or only in development builds. */
export type SettingAvailability = 'always' | 'desktop' | 'dev';

export interface SettingDefinition {
  id: string;
  section: SettingsSectionId;
  /** Preferences the row controls; enables "modified" and "reset to default". */
  prefs?: { section: PreferenceSection; keys: string[] };
  /** `block` rows put their control under the label (editors, previews, card grids). */
  layout?: 'inline' | 'block';
  availability?: SettingAvailability;
}

const general = (id: string, keys?: (keyof AppPreferences['general'])[], extra: Partial<SettingDefinition> = {}) =>
  ({ id, section: 'general', ...(keys ? { prefs: { section: 'general', keys } } : {}), ...extra }) as SettingDefinition;
const appearance = (
  id: string,
  keys?: (keyof AppPreferences['appearance'])[],
  extra: Partial<SettingDefinition> = {}
) => ({ id, section: 'appearance', ...(keys ? { prefs: { section: 'appearance', keys } } : {}), ...extra }) as SettingDefinition;
const terminal = (id: string, keys?: (keyof AppPreferences['terminal'])[], extra: Partial<SettingDefinition> = {}) =>
  ({ id, section: 'terminal', ...(keys ? { prefs: { section: 'terminal', keys } } : {}), ...extra }) as SettingDefinition;

/** Every row of the settings screen, in display order. Labels: `settings.<section>.<id>.label|description`. */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  general('language'),
  general('launch_at_login', undefined, { availability: 'desktop' }),
  general('check_updates', ['checkUpdatesOnStart'], { availability: 'desktop' }),
  general('confirm_stop', ['confirmStopWithPlayers']),

  appearance('mode', ['mode']),
  appearance('theme', ['theme'], { layout: 'block' }),
  appearance('accent', ['accent', 'customAccent'], { layout: 'block' }),
  appearance('tokens', ['tokenOverrides'], { layout: 'block' }),
  appearance('density', ['density']),
  appearance('ui_scale', ['uiScale']),
  appearance('motion', ['motion']),
  appearance('theme_transfer', undefined, { layout: 'block' }),

  terminal('preview', undefined, { layout: 'block' }),
  terminal('theme', ['theme'], { layout: 'block' }),
  terminal('font', ['font']),
  terminal('font_size', ['fontSize']),
  terminal('line_height', ['lineHeight']),
  terminal('wrap', ['wrapLines']),
  terminal('timestamps', ['showTimestamps']),
  terminal('highlight_levels', ['highlightLevels']),
  terminal('rules', ['rules'], { layout: 'block' }),
  terminal('autoscroll', ['autoscroll']),
  terminal('buffer', ['bufferLines']),
  terminal('history', ['historySize']),
  terminal('clear_on_restart', ['clearOnRestart']),
  terminal('quick_commands', ['quickCommands'], { layout: 'block' }),

  { id: 'default_memory', section: 'servers' },
  { id: 'default_java', section: 'servers' },
  { id: 'default_autostart', section: 'servers' },
  { id: 'folders', section: 'servers', layout: 'block' },

  { id: 'transfer', section: 'advanced', layout: 'block' },
  { id: 'daemon', section: 'advanced', layout: 'block' },
  { id: 'clear_history', section: 'advanced' },
  { id: 'mock', section: 'advanced', availability: 'dev' }
];

export const settingLabelKey = (definition: SettingDefinition): string =>
  `settings.${definition.section}.${definition.id}.label`;
export const settingDescriptionKey = (definition: SettingDefinition): string =>
  `settings.${definition.section}.${definition.id}.description`;

export interface AvailabilityContext {
  desktop: boolean;
  dev: boolean;
}

export function isSettingAvailable(definition: SettingDefinition, context: AvailabilityContext): boolean {
  if (definition.availability === 'desktop') return context.desktop;
  if (definition.availability === 'dev') return context.dev;
  return true;
}

/** True when any preference the row controls differs from its default. */
export function isSettingModified(definition: SettingDefinition, current: AppPreferences, defaults: AppPreferences): boolean {
  if (!definition.prefs) return false;
  const { section, keys } = definition.prefs;
  const currentSection = current[section] as unknown as Record<string, unknown>;
  const defaultSection = defaults[section] as unknown as Record<string, unknown>;
  return keys.some((key) => JSON.stringify(currentSection[key]) !== JSON.stringify(defaultSection[key]));
}

/** The default values of the preferences a row controls (what "reset" writes back). */
export function settingDefaults(definition: SettingDefinition, defaults: AppPreferences): Record<string, unknown> {
  if (!definition.prefs) return {};
  const defaultSection = defaults[definition.prefs.section] as unknown as Record<string, unknown>;
  return Object.fromEntries(definition.prefs.keys.map((key) => [key, defaultSection[key]]));
}

/** Case- and accent-insensitive search over the row's translated label, description and id. */
export function matchesSearch(query: string, texts: string[]): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(texts.join(' '));
  return terms.every((term) => haystack.includes(term));
}
