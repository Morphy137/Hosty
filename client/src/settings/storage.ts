import { DEFAULT_PREFERENCES, normalizePreferences, type AppPreferences } from './schema';

export const PREFERENCES_STORAGE_KEY = 'hosty.preferences';
/** Keys used before preferences were grouped; read once, then removed. */
export const LEGACY_THEME_KEY = 'mc-nexus-theme';
export const LEGACY_LANGUAGE_KEY = 'mc_nexus_lang';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readLegacy(storage: StorageLike): AppPreferences {
  const theme = storage.getItem(LEGACY_THEME_KEY);
  const language = storage.getItem(LEGACY_LANGUAGE_KEY);
  return normalizePreferences({
    ...DEFAULT_PREFERENCES,
    general: { ...DEFAULT_PREFERENCES.general, language },
    appearance: {
      ...DEFAULT_PREFERENCES.appearance,
      mode: theme === 'light' || theme === 'dark' ? theme : DEFAULT_PREFERENCES.appearance.mode
    }
  });
}

/** Reads the saved preferences, migrating the legacy keys the first time. Never throws. */
export function loadPreferences(storage: StorageLike | null = defaultStorage()): AppPreferences {
  if (!storage) return DEFAULT_PREFERENCES;
  try {
    const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw) return normalizePreferences(JSON.parse(raw));
    const migrated = readLegacy(storage);
    savePreferences(migrated, storage);
    storage.removeItem(LEGACY_THEME_KEY);
    storage.removeItem(LEGACY_LANGUAGE_KEY);
    return migrated;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: AppPreferences, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage unavailable (private mode, quota): the change still applies for this session.
  }
}

/** Parses an exported preferences file; throws when it is not JSON. */
export function parsePreferencesExport(text: string): AppPreferences {
  return normalizePreferences(JSON.parse(text));
}

export function serializePreferences(preferences: AppPreferences): string {
  return JSON.stringify(preferences, null, 2);
}
