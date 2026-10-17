/**
 * App preferences: every UI customisation lives in one versioned object so it can be migrated,
 * exported and reset as a whole. Colours are never stored as presets here (presets live in index.css);
 * only values the user picked themself are kept as raw colour strings.
 */

export const PREFERENCES_VERSION = 1;

export const COLOR_MODES = ['system', 'light', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const APP_THEMES = ['hosty', 'contrast', 'midnight', 'forest', 'sand'] as const;
export type AppThemeId = (typeof APP_THEMES)[number];

export const ACCENTS = ['blue', 'violet', 'green', 'orange', 'pink', 'red', 'teal', 'custom'] as const;
export type AccentId = (typeof ACCENTS)[number];

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export const MOTION_MODES = ['system', 'full', 'reduced'] as const;
export type MotionMode = (typeof MOTION_MODES)[number];

export const UI_SCALE = { min: 80, max: 130, step: 5, default: 100 } as const;

export const CONSOLE_THEMES = ['app', 'hosty', 'paper', 'solar', 'vampire', 'glacier', 'phosphor'] as const;
export type ConsoleThemeId = (typeof CONSOLE_THEMES)[number];

export const CONSOLE_FONTS = ['geist', 'cascadia', 'consolas', 'jetbrains', 'fira', 'system'] as const;
export type ConsoleFontId = (typeof CONSOLE_FONTS)[number];

export const CONSOLE_COLORS = ['green', 'yellow', 'red', 'blue', 'magenta', 'cyan', 'mute'] as const;
export type ConsoleColor = (typeof CONSOLE_COLORS)[number];

export const AUTOSCROLL_MODES = ['bottom', 'always', 'never'] as const;
export type AutoscrollMode = (typeof AUTOSCROLL_MODES)[number];

export const CONSOLE_FONT_SIZE = { min: 10, max: 20, step: 1, default: 13 } as const;
export const CONSOLE_LINE_HEIGHT = { min: 1.2, max: 2, step: 0.05, default: 1.55 } as const;
export const CONSOLE_BUFFER = { min: 200, max: 10_000, step: 100, default: 1000 } as const;
export const CONSOLE_HISTORY = { min: 0, max: 500, step: 10, default: 100 } as const;
export const MAX_HIGHLIGHT_RULES = 30;
export const MAX_CUSTOM_QUICK_COMMANDS = 12;

/** Tokens the advanced editor can override (names of the CSS variables in index.css, without `--`). */
export const EDITABLE_TOKENS = [
  'canvas',
  'surface',
  'surface-2',
  'surface-3',
  'ink',
  'body',
  'mute',
  'hairline',
  'hairline-strong',
  'danger-fg',
  'success-fg',
  'warning-fg'
] as const;
export type EditableToken = (typeof EDITABLE_TOKENS)[number];
export type TokenOverrides = Partial<Record<EditableToken, string>>;

export interface HighlightRule {
  id: string;
  pattern: string;
  caseSensitive: boolean;
  color: ConsoleColor;
}

export interface QuickCommand {
  label: string;
  command: string;
}

export interface QuickCommandPrefs {
  /** Commands of the game's manifest the user hid. */
  hidden: string[];
  custom: QuickCommand[];
}

export interface GeneralPrefs {
  /** Null until the user picks one: the browser language decides. */
  language: string | null;
  checkUpdatesOnStart: boolean;
  confirmStopWithPlayers: boolean;
}

export interface AppearancePrefs {
  mode: ColorMode;
  theme: AppThemeId;
  accent: AccentId;
  /** Only used when `accent` is `custom`. */
  customAccent: string;
  tokenOverrides: { light: TokenOverrides; dark: TokenOverrides };
  density: Density;
  uiScale: number;
  motion: MotionMode;
}

export interface TerminalPrefs {
  theme: ConsoleThemeId;
  font: ConsoleFontId;
  fontSize: number;
  lineHeight: number;
  wrapLines: boolean;
  showTimestamps: boolean;
  highlightLevels: boolean;
  rules: HighlightRule[];
  autoscroll: AutoscrollMode;
  bufferLines: number;
  historySize: number;
  clearOnRestart: boolean;
  /** Keyed by game id: the game's own commands come from its manifest. */
  quickCommands: Record<string, QuickCommandPrefs>;
}

export interface AppPreferences {
  version: typeof PREFERENCES_VERSION;
  general: GeneralPrefs;
  appearance: AppearancePrefs;
  terminal: TerminalPrefs;
}

export type PreferenceSection = Exclude<keyof AppPreferences, 'version'>;

export const DEFAULT_PREFERENCES: AppPreferences = {
  version: PREFERENCES_VERSION,
  general: {
    language: null,
    checkUpdatesOnStart: true,
    confirmStopWithPlayers: true
  },
  appearance: {
    mode: 'system',
    theme: 'hosty',
    accent: 'blue',
    customAccent: '',
    tokenOverrides: { light: {}, dark: {} },
    density: 'comfortable',
    uiScale: UI_SCALE.default,
    motion: 'system'
  },
  terminal: {
    theme: 'hosty',
    font: 'geist',
    fontSize: CONSOLE_FONT_SIZE.default,
    lineHeight: CONSOLE_LINE_HEIGHT.default,
    wrapLines: true,
    showTimestamps: true,
    highlightLevels: true,
    rules: [],
    autoscroll: 'bottom',
    bufferLines: CONSOLE_BUFFER.default,
    historySize: CONSOLE_HISTORY.default,
    clearOnRestart: false,
    quickCommands: {}
  }
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const COLOR_VALUE = /^#[0-9a-f]{6}$/i;

/** Only `#rrggbb` colours are accepted from storage or imports (anything else could inject CSS). */
export const isColorValue = (value: unknown): value is string => typeof value === 'string' && COLOR_VALUE.test(value);

const pickEnum = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const pickBoolean = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

const pickNumber = (value: unknown, range: { min: number; max: number }, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : fallback;

function sanitizeTokens(value: unknown): TokenOverrides {
  if (!isRecord(value)) return {};
  const tokens: TokenOverrides = {};
  for (const token of EDITABLE_TOKENS) {
    if (isColorValue(value[token])) tokens[token] = value[token];
  }
  return tokens;
}

function sanitizeRules(value: unknown): HighlightRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((rule) => typeof rule.pattern === 'string' && rule.pattern.length > 0)
    .slice(0, MAX_HIGHLIGHT_RULES)
    .map((rule, index) => ({
      id: typeof rule.id === 'string' && rule.id ? rule.id : `rule-${index}`,
      pattern: String(rule.pattern),
      caseSensitive: pickBoolean(rule.caseSensitive, false),
      color: pickEnum(CONSOLE_COLORS, rule.color, 'green')
    }));
}

function sanitizeQuickCommands(value: unknown): Record<string, QuickCommandPrefs> {
  if (!isRecord(value)) return {};
  const result: Record<string, QuickCommandPrefs> = {};
  for (const [gameId, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    const hidden = Array.isArray(entry.hidden) ? entry.hidden.filter((item): item is string => typeof item === 'string') : [];
    const custom = Array.isArray(entry.custom)
      ? entry.custom
          .filter(isRecord)
          .filter((item) => typeof item.label === 'string' && typeof item.command === 'string' && item.command.trim())
          .slice(0, MAX_CUSTOM_QUICK_COMMANDS)
          .map((item) => ({ label: String(item.label), command: String(item.command) }))
      : [];
    result[gameId] = { hidden, custom };
  }
  return result;
}

/**
 * Turns anything read from storage or an import into valid preferences: unknown fields are dropped,
 * invalid ones fall back to their default, so a corrupted or future file never breaks the app.
 */
export function normalizePreferences(raw: unknown): AppPreferences {
  const root = isRecord(raw) ? raw : {};
  const general = isRecord(root.general) ? root.general : {};
  const appearance = isRecord(root.appearance) ? root.appearance : {};
  const terminal = isRecord(root.terminal) ? root.terminal : {};
  const overrides = isRecord(appearance.tokenOverrides) ? appearance.tokenOverrides : {};
  const defaults = DEFAULT_PREFERENCES;

  return {
    version: PREFERENCES_VERSION,
    general: {
      language: typeof general.language === 'string' && general.language ? general.language : null,
      checkUpdatesOnStart: pickBoolean(general.checkUpdatesOnStart, defaults.general.checkUpdatesOnStart),
      confirmStopWithPlayers: pickBoolean(general.confirmStopWithPlayers, defaults.general.confirmStopWithPlayers)
    },
    appearance: {
      mode: pickEnum(COLOR_MODES, appearance.mode, defaults.appearance.mode),
      theme: pickEnum(APP_THEMES, appearance.theme, defaults.appearance.theme),
      accent: pickEnum(ACCENTS, appearance.accent, defaults.appearance.accent),
      customAccent: isColorValue(appearance.customAccent) ? appearance.customAccent : '',
      tokenOverrides: { light: sanitizeTokens(overrides.light), dark: sanitizeTokens(overrides.dark) },
      density: pickEnum(DENSITIES, appearance.density, defaults.appearance.density),
      uiScale: pickNumber(appearance.uiScale, UI_SCALE, defaults.appearance.uiScale),
      motion: pickEnum(MOTION_MODES, appearance.motion, defaults.appearance.motion)
    },
    terminal: {
      theme: pickEnum(CONSOLE_THEMES, terminal.theme, defaults.terminal.theme),
      font: pickEnum(CONSOLE_FONTS, terminal.font, defaults.terminal.font),
      fontSize: pickNumber(terminal.fontSize, CONSOLE_FONT_SIZE, defaults.terminal.fontSize),
      lineHeight: pickNumber(terminal.lineHeight, CONSOLE_LINE_HEIGHT, defaults.terminal.lineHeight),
      wrapLines: pickBoolean(terminal.wrapLines, defaults.terminal.wrapLines),
      showTimestamps: pickBoolean(terminal.showTimestamps, defaults.terminal.showTimestamps),
      highlightLevels: pickBoolean(terminal.highlightLevels, defaults.terminal.highlightLevels),
      rules: sanitizeRules(terminal.rules),
      autoscroll: pickEnum(AUTOSCROLL_MODES, terminal.autoscroll, defaults.terminal.autoscroll),
      bufferLines: Math.round(pickNumber(terminal.bufferLines, CONSOLE_BUFFER, defaults.terminal.bufferLines)),
      historySize: Math.round(pickNumber(terminal.historySize, CONSOLE_HISTORY, defaults.terminal.historySize)),
      clearOnRestart: pickBoolean(terminal.clearOnRestart, defaults.terminal.clearOnRestart),
      quickCommands: sanitizeQuickCommands(terminal.quickCommands)
    }
  };
}
