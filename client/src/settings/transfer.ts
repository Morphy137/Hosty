import { normalizePreferences, type AppPreferences } from './schema';

export const THEME_EXPORT_KIND = 'hosty-theme';
export const THEME_EXPORT_VERSION = 1;

/** The look only (no behaviour settings), to share a theme without touching the other preferences. */
export function serializeTheme(preferences: AppPreferences): string {
  const { theme, accent, customAccent, tokenOverrides } = preferences.appearance;
  return JSON.stringify(
    {
      kind: THEME_EXPORT_KIND,
      version: THEME_EXPORT_VERSION,
      appearance: { theme, accent, customAccent, tokenOverrides },
      terminal: { theme: preferences.terminal.theme }
    },
    null,
    2
  );
}

/** Applies an exported theme over the current preferences; throws when the text is not a theme export. */
export function applyThemeImport(text: string, current: AppPreferences): AppPreferences {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || (parsed as { kind?: unknown }).kind !== THEME_EXPORT_KIND) {
    throw new Error('Not a Hosty theme export');
  }
  const source = parsed as { appearance?: Record<string, unknown>; terminal?: Record<string, unknown> };
  return normalizePreferences({
    ...current,
    appearance: { ...current.appearance, ...source.appearance },
    terminal: { ...current.terminal, ...(source.terminal?.theme ? { theme: source.terminal.theme } : {}) }
  });
}

/** Offers a text file to save (browser download; the desktop webview saves it to Downloads). */
export function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
