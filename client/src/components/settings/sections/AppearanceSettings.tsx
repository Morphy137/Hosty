import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Download, Monitor, Moon, RotateCcw, Sun, Upload } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ColorPicker } from '../../ui/ColorPicker';
import { IconButton } from '../../ui/IconButton';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider } from '../../ui/Slider';
import { useToast } from '../../ui/toastContext';
import { ImportDialog } from '../ImportDialog';
import { usePreferences } from '../../../settings/preferencesContext';
import {
  ACCENTS,
  APP_THEMES,
  DENSITIES,
  EDITABLE_TOKENS,
  MOTION_MODES,
  UI_SCALE,
  type AccentId,
  type AppThemeId,
  type ColorMode,
  type EditableToken
} from '../../../settings/schema';
import { readToken } from '../../../settings/appearance';
import { contrastRatio, MIN_TEXT_CONTRAST, parseColor } from '../../../settings/color';
import { applyThemeImport, downloadTextFile, serializeTheme } from '../../../settings/transfer';
import { cn } from '../../../utils/cn';
import type { SettingControlProps } from '../settingsEnvironment';

const MODE_ICONS: Record<ColorMode, React.ReactNode> = {
  system: <Monitor className="h-3.5 w-3.5" />,
  light: <Sun className="h-3.5 w-3.5" />,
  dark: <Moon className="h-3.5 w-3.5" />
};

/** Text tokens checked against the surface they are drawn on. */
const CONTRAST_CHECKS = ['ink', 'body', 'mute', 'accent-fg'] as const;
const THEME_FILE_NAME = 'hosty-theme.json';

/** Miniature of the app drawn with the theme's own tokens (the data attribute scopes them to the card). */
const ThemeCard: React.FC<{ theme: AppThemeId; selected: boolean; onSelect: () => void }> = ({
  theme,
  selected,
  onSelect
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer flex-col gap-2 rounded-[8px] border p-2 text-left transition-colors',
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-hairline-strong'
      )}
    >
      <div data-theme={theme} className="flex h-16 overflow-hidden rounded-[6px] border border-hairline bg-canvas">
        <div className="flex w-1/3 flex-col gap-1 border-r border-hairline bg-surface p-1.5">
          <span className="h-1.5 w-3/4 rounded-full bg-ink" />
          <span className="h-1.5 w-1/2 rounded-full bg-mute" />
          <span className="h-1.5 w-2/3 rounded-full bg-hairline-strong" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-1.5">
          <span className="h-2 w-1/2 rounded-full bg-ink" />
          <span className="h-1.5 w-3/4 rounded-full bg-body" />
          <span className="mt-auto h-2 w-6 rounded-full bg-accent" />
        </div>
      </div>
      <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
        {selected && <Check className="h-3 w-3 text-accent-fg" />}
        {t(`settings.appearance.theme.options.${theme}`)}
      </span>
    </button>
  );
};

const ThemePicker: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  return (
    <div role="radiogroup" aria-label={t('settings.appearance.theme.label')} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {APP_THEMES.map((theme) => (
        <ThemeCard
          key={theme}
          theme={theme}
          selected={preferences.appearance.theme === theme}
          onSelect={() => update('appearance', { theme })}
        />
      ))}
    </div>
  );
};

const AccentPicker: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const { accent, customAccent } = preferences.appearance;
  const swatches = ACCENTS.filter((id): id is Exclude<AccentId, 'custom'> => id !== 'custom');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={t('settings.appearance.accent.label')} className="flex items-center gap-2">
        {swatches.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={accent === id}
            aria-label={t(`settings.appearance.accent.options.${id}`)}
            title={t(`settings.appearance.accent.options.${id}`)}
            onClick={() => update('appearance', { accent: id })}
            className={cn(
              'flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
              accent === id ? 'border-ink' : 'border-transparent'
            )}
            style={{ background: `var(--swatch-${id})` }}
          >
            {accent === id && <Check className="h-3.5 w-3.5 text-on-accent" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-mute">{t('settings.appearance.accent.custom')}</span>
        <ColorPicker
          ariaLabel={t('settings.appearance.accent.custom')}
          value={accent === 'custom' ? customAccent : ''}
          onChange={(value) => update('appearance', { accent: 'custom', customAccent: value })}
        />
      </div>
    </div>
  );
};

/** Reads the live token values after every appearance change (themes and overrides resolve in CSS). */
function useLiveTokens(tokens: readonly string[]): Record<string, string> {
  const { preferences, isDark } = usePreferences();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    // Wait a frame so the provider has written the new attributes and variables.
    const frame = requestAnimationFrame(() => {
      setValues(Object.fromEntries(tokens.map((token) => [token, readToken(token)])));
    });
    return () => cancelAnimationFrame(frame);
  }, [preferences.appearance, isDark, tokens]);
  return values;
}

const LIVE_TOKENS = [...EDITABLE_TOKENS, 'accent-fg'] as const;

const ContrastWarnings: React.FC<{ values: Record<string, string> }> = ({ values }) => {
  const { t } = useTranslation();
  const surface = parseColor(values.surface ?? '');
  if (!surface) return null;
  const failing = CONTRAST_CHECKS.filter((token) => {
    const color = parseColor(values[token] ?? '');
    return color !== null && contrastRatio(color, surface) < MIN_TEXT_CONTRAST;
  });
  if (failing.length === 0) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-[6px] bg-warning-soft px-3 py-2 text-[12px] text-warning-fg">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {t('settings.appearance.tokens.contrast_warning', {
          tokens: failing.map((token) => t(`settings.appearance.tokens.names.${token}`)).join(', ')
        })}
      </span>
    </div>
  );
};

const TokenEditor: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, isDark, update } = usePreferences();
  const modeKey = isDark ? 'dark' : 'light';
  const overrides = preferences.appearance.tokenOverrides[modeKey];
  const values = useLiveTokens(LIVE_TOKENS);

  const setToken = (token: EditableToken, value: string | undefined) => {
    const next = { ...overrides };
    if (value) next[token] = value;
    else delete next[token];
    update('appearance', { tokenOverrides: { ...preferences.appearance.tokenOverrides, [modeKey]: next } });
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-mute">
        {t(isDark ? 'settings.appearance.tokens.editing_dark' : 'settings.appearance.tokens.editing_light')}
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {EDITABLE_TOKENS.map((token) => (
          <div key={token} className="flex items-center justify-between gap-2">
            <span className={cn('text-[13px]', overrides[token] ? 'font-medium text-ink' : 'text-body')}>
              {t(`settings.appearance.tokens.names.${token}`)}
            </span>
            <div className="flex items-center gap-1">
              <ColorPicker
                ariaLabel={t(`settings.appearance.tokens.names.${token}`)}
                value={overrides[token] ?? values[token] ?? ''}
                onChange={(value) => setToken(token, value)}
              />
              <IconButton
                label={t('settings.reset')}
                variant="ghost"
                disabled={!overrides[token]}
                onClick={() => setToken(token, undefined)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
      <ContrastWarnings values={values} />
    </div>
  );
};

const ThemeTransfer: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { preferences, replace } = usePreferences();
  const [importing, setImporting] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serializeTheme(preferences));
      toast({ title: t('settings.transfer.copied'), variant: 'success' });
    } catch {
      toast({ title: t('settings.transfer.copy_failed'), variant: 'error' });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => void copy()}>
        <Copy className="h-3.5 w-3.5" />
        {t('settings.transfer.copy')}
      </Button>
      <Button size="sm" onClick={() => downloadTextFile(THEME_FILE_NAME, serializeTheme(preferences))}>
        <Download className="h-3.5 w-3.5" />
        {t('settings.transfer.save_file')}
      </Button>
      <Button size="sm" onClick={() => setImporting(true)}>
        <Upload className="h-3.5 w-3.5" />
        {t('settings.transfer.import')}
      </Button>
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        title={t('settings.appearance.theme_transfer.import_title')}
        description={t('settings.appearance.theme_transfer.import_description')}
        onImport={(text) => {
          replace(applyThemeImport(text, preferences));
          toast({ title: t('settings.transfer.imported'), variant: 'success' });
        }}
      />
    </div>
  );
};

/** Controls of Settings > Appearance. */
export const AppearanceSettings: React.FC<SettingControlProps> = ({ id }) => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const { appearance } = preferences;

  switch (id) {
    case 'mode':
      return (
        <SegmentedControl
          ariaLabel={t('settings.appearance.mode.label')}
          value={appearance.mode}
          onValueChange={(mode) => update('appearance', { mode })}
          options={(['system', 'light', 'dark'] as const).map((mode) => ({
            value: mode,
            icon: MODE_ICONS[mode],
            label: t(`settings.appearance.mode.options.${mode}`)
          }))}
        />
      );
    case 'theme':
      return <ThemePicker />;
    case 'accent':
      return <AccentPicker />;
    case 'tokens':
      return <TokenEditor />;
    case 'density':
      return (
        <SegmentedControl
          ariaLabel={t('settings.appearance.density.label')}
          value={appearance.density}
          onValueChange={(density) => update('appearance', { density })}
          options={DENSITIES.map((density) => ({
            value: density,
            label: t(`settings.appearance.density.options.${density}`)
          }))}
        />
      );
    case 'ui_scale':
      return (
        <div className="flex w-56 items-center gap-3">
          <Slider
            ariaLabel={t('settings.appearance.ui_scale.label')}
            min={UI_SCALE.min}
            max={UI_SCALE.max}
            step={UI_SCALE.step}
            value={appearance.uiScale}
            onChange={(uiScale) => update('appearance', { uiScale })}
          />
          <span className="w-10 text-right font-mono text-[12px] text-ink">{appearance.uiScale}%</span>
        </div>
      );
    case 'motion':
      return (
        <SegmentedControl
          ariaLabel={t('settings.appearance.motion.label')}
          value={appearance.motion}
          onValueChange={(motion) => update('appearance', { motion })}
          options={MOTION_MODES.map((motion) => ({
            value: motion,
            label: t(`settings.appearance.motion.options.${motion}`)
          }))}
        />
      );
    case 'theme_transfer':
      return <ThemeTransfer />;
    default:
      return null;
  }
};
