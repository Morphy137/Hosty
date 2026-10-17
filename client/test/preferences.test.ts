import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, MAX_HIGHLIGHT_RULES, normalizePreferences, CONSOLE_BUFFER } from '../src/settings/schema';
import {
  LEGACY_LANGUAGE_KEY,
  LEGACY_THEME_KEY,
  PREFERENCES_STORAGE_KEY,
  loadPreferences,
  parsePreferencesExport,
  savePreferences,
  serializePreferences
} from '../src/settings/storage';
import { applyThemeImport, serializeTheme } from '../src/settings/transfer';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
}

describe('normalizePreferences', () => {
  it('returns the defaults for anything that is not an object', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences('nope')).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences([1, 2])).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid values and replaces invalid ones with defaults', () => {
    const prefs = normalizePreferences({
      appearance: { mode: 'dark', theme: 'unknown-theme', uiScale: 999, customAccent: 'red;background:url(x)' },
      terminal: { fontSize: 2, bufferLines: 2500.4, wrapLines: 'yes' }
    });
    expect(prefs.appearance.mode).toBe('dark');
    expect(prefs.appearance.theme).toBe(DEFAULT_PREFERENCES.appearance.theme);
    expect(prefs.appearance.uiScale).toBe(130);
    expect(prefs.appearance.customAccent).toBe('');
    expect(prefs.terminal.fontSize).toBe(10);
    expect(prefs.terminal.bufferLines).toBe(2500);
    expect(prefs.terminal.wrapLines).toBe(DEFAULT_PREFERENCES.terminal.wrapLines);
  });

  it('only accepts #rrggbb token overrides', () => {
    const prefs = normalizePreferences({
      appearance: { tokenOverrides: { light: { surface: '#112233', ink: 'blue', unknown: '#000000' }, dark: 'x' } }
    });
    expect(prefs.appearance.tokenOverrides).toEqual({ light: { surface: '#112233' }, dark: {} });
  });

  it('drops empty or excess highlight rules and invalid quick commands', () => {
    const rules = Array.from({ length: MAX_HIGHLIGHT_RULES + 5 }, (_value, index) => ({ pattern: `p${index}`, color: 'red' }));
    const prefs = normalizePreferences({
      terminal: {
        rules: [{ pattern: '' }, ...rules],
        quickCommands: { minecraft: { hidden: ['list', 3], custom: [{ label: 'Day', command: 'time set day' }, { label: 'x' }] } }
      }
    });
    expect(prefs.terminal.rules).toHaveLength(MAX_HIGHLIGHT_RULES);
    expect(prefs.terminal.rules[0]).toMatchObject({ pattern: 'p0', color: 'red', caseSensitive: false });
    expect(prefs.terminal.quickCommands.minecraft).toEqual({
      hidden: ['list'],
      custom: [{ label: 'Day', command: 'time set day' }]
    });
  });

  it('clamps the console buffer to its range', () => {
    expect(normalizePreferences({ terminal: { bufferLines: 1 } }).terminal.bufferLines).toBe(CONSOLE_BUFFER.min);
  });
});

describe('preference storage', () => {
  it('migrates the legacy theme and language keys once and removes them', () => {
    const storage = memoryStorage({ [LEGACY_THEME_KEY]: 'dark', [LEGACY_LANGUAGE_KEY]: 'es' });
    const prefs = loadPreferences(storage);
    expect(prefs.appearance.mode).toBe('dark');
    expect(prefs.general.language).toBe('es');
    expect(storage.data.has(LEGACY_THEME_KEY)).toBe(false);
    expect(storage.data.has(LEGACY_LANGUAGE_KEY)).toBe(false);
    expect(JSON.parse(storage.data.get(PREFERENCES_STORAGE_KEY)!)).toEqual(prefs);
  });

  it('starts from the defaults (system mode) without legacy keys', () => {
    expect(loadPreferences(memoryStorage()).appearance.mode).toBe('system');
  });

  it('falls back to the defaults on corrupted JSON or a throwing storage', () => {
    expect(loadPreferences(memoryStorage({ [PREFERENCES_STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_PREFERENCES);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined
    };
    expect(loadPreferences(throwing)).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(DEFAULT_PREFERENCES, throwing)).not.toThrow();
  });

  it('round-trips an export', () => {
    const prefs = normalizePreferences({ appearance: { theme: 'forest', accent: 'pink' }, terminal: { font: 'fira' } });
    expect(parsePreferencesExport(serializePreferences(prefs))).toEqual(prefs);
    expect(() => parsePreferencesExport('not json')).toThrow();
  });
});

describe('theme transfer', () => {
  it('imports only the look and keeps behaviour preferences', () => {
    const source = normalizePreferences({
      appearance: { theme: 'sand', accent: 'custom', customAccent: '#ff8800', density: 'compact' },
      terminal: { theme: 'vampire', fontSize: 18 }
    });
    const current = normalizePreferences({ terminal: { fontSize: 12 }, general: { confirmStopWithPlayers: false } });
    const result = applyThemeImport(serializeTheme(source), current);
    expect(result.appearance).toMatchObject({ theme: 'sand', accent: 'custom', customAccent: '#ff8800' });
    expect(result.appearance.density).toBe(current.appearance.density);
    expect(result.terminal.theme).toBe('vampire');
    expect(result.terminal.fontSize).toBe(12);
    expect(result.general.confirmStopWithPlayers).toBe(false);
  });

  it('rejects files that are not theme exports', () => {
    expect(() => applyThemeImport(serializePreferences(DEFAULT_PREFERENCES), DEFAULT_PREFERENCES)).toThrow();
  });
});
