import { describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';
import {
  SETTING_DEFINITIONS,
  SETTINGS_SECTIONS,
  isSettingAvailable,
  isSettingModified,
  matchesSearch,
  settingDefaults,
  settingDescriptionKey,
  settingLabelKey
} from '../src/settings/registry';
import {
  ACCENTS,
  APP_THEMES,
  AUTOSCROLL_MODES,
  CONSOLE_COLORS,
  CONSOLE_FONTS,
  CONSOLE_THEMES,
  DEFAULT_PREFERENCES,
  DENSITIES,
  EDITABLE_TOKENS,
  MOTION_MODES,
  normalizePreferences
} from '../src/settings/schema';

type Dictionary = Record<string, unknown>;

function lookup(dictionary: Dictionary, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Dictionary | undefined)?.[part], dictionary);
}

const dictionaries = { en: en as Dictionary, es: es as Dictionary };

describe('settings registry', () => {
  it('has unique ids per section and only known sections', () => {
    const ids = SETTING_DEFINITIONS.map((definition) => `${definition.section}.${definition.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    for (const definition of SETTING_DEFINITIONS) expect(SETTINGS_SECTIONS).toContain(definition.section);
  });

  it.each(Object.entries(dictionaries))('has a label and description for every row and section (%s)', (_code, dictionary) => {
    const missing = [
      ...SETTING_DEFINITIONS.flatMap((definition) => [settingLabelKey(definition), settingDescriptionKey(definition)]),
      ...SETTINGS_SECTIONS.flatMap((section) => [`settings.sections.${section}.title`, `settings.sections.${section}.description`])
    ].filter((key) => typeof lookup(dictionary, key) !== 'string');
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(dictionaries))('translates every option of the enumerated settings (%s)', (_code, dictionary) => {
    const keys = [
      ...['system', 'light', 'dark'].map((value) => `settings.appearance.mode.options.${value}`),
      ...APP_THEMES.map((value) => `settings.appearance.theme.options.${value}`),
      ...ACCENTS.filter((value) => value !== 'custom').map((value) => `settings.appearance.accent.options.${value}`),
      ...DENSITIES.map((value) => `settings.appearance.density.options.${value}`),
      ...MOTION_MODES.map((value) => `settings.appearance.motion.options.${value}`),
      ...[...EDITABLE_TOKENS, 'accent-fg'].map((value) => `settings.appearance.tokens.names.${value}`),
      ...CONSOLE_THEMES.map((value) => `settings.terminal.theme.options.${value}`),
      ...CONSOLE_FONTS.map((value) => `settings.terminal.font.options.${value}`),
      ...CONSOLE_COLORS.map((value) => `settings.terminal.rules.colors.${value}`),
      ...AUTOSCROLL_MODES.map((value) => `settings.terminal.autoscroll.options.${value}`)
    ];
    expect(keys.filter((key) => typeof lookup(dictionary, key) !== 'string')).toEqual([]);
  });

  it('points every controlled preference at an existing key', () => {
    for (const definition of SETTING_DEFINITIONS) {
      if (!definition.prefs) continue;
      const section = DEFAULT_PREFERENCES[definition.prefs.section] as unknown as Dictionary;
      for (const key of definition.prefs.keys) expect(Object.keys(section)).toContain(key);
    }
  });

  it('detects modified rows and returns their defaults', () => {
    const font = SETTING_DEFINITIONS.find((definition) => definition.section === 'terminal' && definition.id === 'font')!;
    const changed = normalizePreferences({ terminal: { font: 'fira' } });
    expect(isSettingModified(font, DEFAULT_PREFERENCES, DEFAULT_PREFERENCES)).toBe(false);
    expect(isSettingModified(font, changed, DEFAULT_PREFERENCES)).toBe(true);
    expect(settingDefaults(font, DEFAULT_PREFERENCES)).toEqual({ font: DEFAULT_PREFERENCES.terminal.font });
  });

  it('hides desktop and dev rows where they do not apply', () => {
    const launch = SETTING_DEFINITIONS.find((definition) => definition.id === 'launch_at_login')!;
    const mock = SETTING_DEFINITIONS.find((definition) => definition.id === 'mock')!;
    expect(isSettingAvailable(launch, { desktop: false, dev: true })).toBe(false);
    expect(isSettingAvailable(launch, { desktop: true, dev: false })).toBe(true);
    expect(isSettingAvailable(mock, { desktop: true, dev: false })).toBe(false);
  });

  it('searches without caring about case or accents', () => {
    expect(matchesSearch('tamano fuente', ['Tamaño de fuente'])).toBe(true);
    expect(matchesSearch('FONT', ['Font size'])).toBe(true);
    expect(matchesSearch('zoom', ['Font size'])).toBe(false);
    expect(matchesSearch('   ', ['anything'])).toBe(true);
  });
});
