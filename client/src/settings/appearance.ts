import { formatColor, onColor, parseColor, readableVariant } from './color';
import { EDITABLE_TOKENS, type AppPreferences, type ConsoleFontId, type ConsoleThemeId } from './schema';

/** Font stacks for the console: installed fonts first, the bundled Geist Mono as the last resort. */
export const CONSOLE_FONT_STACKS: Record<ConsoleFontId, string> = {
  geist: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace",
  cascadia: "'Cascadia Mono', 'Cascadia Code', Consolas, 'Geist Mono Variable', monospace",
  consolas: "Consolas, 'Courier New', 'Geist Mono Variable', monospace",
  jetbrains: "'JetBrains Mono', Consolas, 'Geist Mono Variable', monospace",
  fira: "'Fira Code', 'Fira Mono', Consolas, 'Geist Mono Variable', monospace",
  system: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
};

/** Every CSS variable this module may set inline, so stale ones can be removed. */
export const MANAGED_VARIABLES = [
  ...EDITABLE_TOKENS.map((token) => `--${token}`),
  '--accent',
  '--accent-fg',
  '--on-accent',
  '--console-font',
  '--console-font-size',
  '--console-line-height'
] as const;

export interface ResolvedAppearance {
  dark: boolean;
  attributes: Record<string, string>;
  /** Variables known without reading the stylesheet (overrides, console typography). */
  variables: Record<string, string>;
  /** Picked accent colour, when the user chose a custom one. */
  customAccent: string | null;
  zoom: number;
}

export function resolveConsoleTheme(theme: ConsoleThemeId, dark: boolean): Exclude<ConsoleThemeId, 'app'> {
  if (theme !== 'app') return theme;
  return dark ? 'hosty' : 'paper';
}

/** Pure mapping from preferences to what the document needs (attributes, variables, zoom). */
export function resolveAppearance(preferences: AppPreferences, systemPrefersDark: boolean): ResolvedAppearance {
  const { appearance, terminal } = preferences;
  const dark = appearance.mode === 'system' ? systemPrefersDark : appearance.mode === 'dark';
  const overrides = dark ? appearance.tokenOverrides.dark : appearance.tokenOverrides.light;
  const variables: Record<string, string> = {
    '--console-font': CONSOLE_FONT_STACKS[terminal.font],
    '--console-font-size': `${terminal.fontSize}px`,
    '--console-line-height': String(terminal.lineHeight)
  };
  for (const [token, value] of Object.entries(overrides)) {
    if (value) variables[`--${token}`] = value;
  }
  const customAccent = appearance.accent === 'custom' && appearance.customAccent ? appearance.customAccent : null;

  return {
    dark,
    attributes: {
      'data-theme': appearance.theme,
      'data-accent': customAccent ? 'custom' : appearance.accent === 'custom' ? 'blue' : appearance.accent,
      'data-density': appearance.density,
      'data-motion': appearance.motion,
      'data-console-theme': resolveConsoleTheme(terminal.theme, dark)
    },
    variables,
    customAccent,
    zoom: appearance.uiScale / 100
  };
}

/** Accent variables for a custom colour: the text variant is adjusted to stay readable on `surface`. */
export function customAccentVariables(accent: string, surface: string): Record<string, string> {
  const accentRgb = parseColor(accent);
  const surfaceRgb = parseColor(surface);
  if (!accentRgb) return {};
  return {
    '--accent': formatColor(accentRgb),
    '--accent-fg': formatColor(surfaceRgb ? readableVariant(accentRgb, surfaceRgb) : accentRgb),
    '--on-accent': formatColor(onColor(accentRgb))
  };
}

/** Writes a resolved appearance onto the root element (by default `<html>`). */
export function applyAppearance(resolved: ResolvedAppearance, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', resolved.dark);
  root.style.colorScheme = resolved.dark ? 'dark' : 'light';
  for (const [name, value] of Object.entries(resolved.attributes)) root.setAttribute(name, value);
  for (const name of MANAGED_VARIABLES) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(resolved.variables)) root.style.setProperty(name, value);

  if (resolved.customAccent) {
    // The surface depends on the theme and mode just applied, so it is read back from the stylesheet.
    const surface = getComputedStyle(root).getPropertyValue('--surface').trim();
    for (const [name, value] of Object.entries(customAccentVariables(resolved.customAccent, surface))) {
      root.style.setProperty(name, value);
    }
  }
}

/** Current value of a design token (after themes and overrides). */
export function readToken(token: string, root: HTMLElement = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(`--${token}`).trim();
}
