import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Input } from '../../ui/Input';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Select } from '../../ui/Select';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Switch';
import { ConsoleOutput } from '../../console/ConsoleOutput';
import { usePreferences } from '../../../settings/preferencesContext';
import { resolveConsoleTheme } from '../../../settings/appearance';
import {
  AUTOSCROLL_MODES,
  CONSOLE_BUFFER,
  CONSOLE_COLORS,
  CONSOLE_FONT_SIZE,
  CONSOLE_FONTS,
  CONSOLE_HISTORY,
  CONSOLE_LINE_HEIGHT,
  CONSOLE_THEMES,
  MAX_CUSTOM_QUICK_COMMANDS,
  MAX_HIGHLIGHT_RULES,
  type ConsoleThemeId,
  type HighlightRule,
  type QuickCommandPrefs,
  type TerminalPrefs
} from '../../../settings/schema';
import { CONSOLE_COLOR_CLASSES, isValidRulePattern } from '../../../utils/console';
import { cn } from '../../../utils/cn';
import type { SettingControlProps, SettingsEnvironment } from '../settingsEnvironment';

/** Log lines used by the live preview (server output is not translated). */
const PREVIEW_LINES = [
  '[12:00:01 INFO]: Starting minecraft server version 1.21.4',
  '[12:00:03 INFO]: Preparing level "world"',
  '[12:00:05 WARN]: Ambiguity between arguments [teleport, targets, location]',
  '[12:00:06 INFO]: Done (4.812s)! For help, type "help"',
  '[12:01:12 INFO]: Steve joined the game',
  '> say Welcome to the server',
  '[12:01:20 ERROR]: Could not pass event PlayerJoinEvent to ExamplePlugin'
];

/** Console-looking samples shown on the theme cards and colour options. */
const CARD_SAMPLE = { command: '$ list', warning: '[WARN]', echo: '> ok', glyphs: 'Aa' } as const;

const TerminalPreview: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-56 flex-col overflow-hidden rounded-[8px] border border-console-border bg-console text-console-fg">
      <ConsoleOutput lines={PREVIEW_LINES} emptyText={t('overview.console_ready')} />
    </div>
  );
};

const ConsoleThemeCard: React.FC<{ theme: ConsoleThemeId; selected: boolean; onSelect: () => void }> = ({
  theme,
  selected,
  onSelect
}) => {
  const { t } = useTranslation();
  const { isDark } = usePreferences();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-[8px] border p-2 text-left transition-colors',
        selected ? 'border-accent ring-1 ring-accent' : 'border-hairline hover:border-hairline-strong'
      )}
    >
      <div
        data-console-theme={resolveConsoleTheme(theme, isDark)}
        className="flex h-14 flex-col justify-center gap-1 rounded-[6px] border border-console-border bg-console px-2 font-mono text-[10px] leading-tight"
      >
        <span className="text-console-fg">{CARD_SAMPLE.command}</span>
        <span className="text-console-yellow">{CARD_SAMPLE.warning}</span>
        <span className="text-console-green">{CARD_SAMPLE.echo}</span>
      </div>
      <span className="flex items-center gap-1 text-[12px] font-medium text-ink">
        {selected && <Check className="h-3 w-3 text-accent-fg" />}
        {t(`settings.terminal.theme.options.${theme}`)}
      </span>
    </button>
  );
};

const RangeControl: React.FC<{
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (value: number) => string;
  onChange: (value: number) => void;
}> = ({ label, value, range, format, onChange }) => (
  <div className="flex w-56 items-center gap-3">
    <Slider ariaLabel={label} min={range.min} max={range.max} step={range.step} value={value} onChange={onChange} />
    <span className="w-14 text-right font-mono text-[12px] text-ink">{format(value)}</span>
  </div>
);

const RulesEditor: React.FC = () => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const { rules } = preferences.terminal;
  const setRules = (next: HighlightRule[]) => update('terminal', { rules: next });
  const patchRule = (id: string, patch: Partial<HighlightRule>) =>
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));

  return (
    <div className="space-y-2">
      {rules.length === 0 && <p className="text-[12px] text-mute">{t('settings.terminal.rules.empty')}</p>}
      {rules.map((rule) => {
        const valid = isValidRulePattern(rule.pattern);
        return (
          <div key={rule.id} className="flex flex-wrap items-center gap-2">
            <Input
              value={rule.pattern}
              onChange={(event) => patchRule(rule.id, { pattern: event.target.value })}
              aria-label={t('settings.terminal.rules.pattern')}
              aria-invalid={!valid}
              placeholder={t('settings.terminal.rules.pattern_placeholder')}
              spellCheck={false}
              className={cn('min-w-48 flex-1 font-mono text-[12px]', !valid && 'border-danger')}
            />
            <Select
              className="w-32"
              ariaLabel={t('settings.terminal.rules.color')}
              value={rule.color}
              onValueChange={(color) => patchRule(rule.id, { color: color as HighlightRule['color'] })}
              options={CONSOLE_COLORS.map((color) => ({
                value: color,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <span data-console-theme="hosty" className="inline-flex rounded-[3px] bg-console px-1">
                      <span className={cn('font-mono text-[11px]', CONSOLE_COLOR_CLASSES[color])}>{CARD_SAMPLE.glyphs}</span>
                    </span>
                    {t(`settings.terminal.rules.colors.${color}`)}
                  </span>
                )
              }))}
            />
            <label className="flex items-center gap-1.5 text-[12px] text-body">
              <Switch
                checked={rule.caseSensitive}
                ariaLabel={t('settings.terminal.rules.case_sensitive')}
                onCheckedChange={(caseSensitive) => patchRule(rule.id, { caseSensitive })}
              />
              {t('settings.terminal.rules.case_sensitive')}
            </label>
            <IconButton
              label={t('settings.terminal.rules.remove')}
              onClick={() => setRules(rules.filter((candidate) => candidate.id !== rule.id))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
            {!valid && <span className="w-full text-[12px] text-danger-fg">{t('settings.terminal.rules.invalid')}</span>}
          </div>
        );
      })}
      <Button
        size="sm"
        disabled={rules.length >= MAX_HIGHLIGHT_RULES}
        onClick={() =>
          setRules([...rules, { id: `rule-${Date.now()}`, pattern: '', caseSensitive: false, color: 'green' }])
        }
      >
        <Plus className="h-3.5 w-3.5" />
        {t('settings.terminal.rules.add')}
      </Button>
    </div>
  );
};

const EMPTY_QUICK_COMMANDS: QuickCommandPrefs = { hidden: [], custom: [] };

const QuickCommandsEditor: React.FC<{ env: SettingsEnvironment }> = ({ env }) => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const [gameId, setGameId] = useState(() => env.games[0]?.id ?? '');
  const game = env.games.find((candidate) => candidate.id === gameId);
  const all = preferences.terminal.quickCommands;
  const current = all[gameId] ?? EMPTY_QUICK_COMMANDS;

  if (env.games.length === 0) return <p className="text-[12px] text-mute">{t('settings.terminal.quick_commands.no_games')}</p>;

  const save = (next: QuickCommandPrefs) => update('terminal', { quickCommands: { ...all, [gameId]: next } });
  const toggleHidden = (command: string, visible: boolean) =>
    save({
      ...current,
      hidden: visible ? current.hidden.filter((item) => item !== command) : [...current.hidden, command]
    });
  const patchCustom = (index: number, patch: Partial<{ label: string; command: string }>) =>
    save({ ...current, custom: current.custom.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  return (
    <div className="space-y-3">
      <Select
        className="w-64"
        ariaLabel={t('settings.terminal.quick_commands.game')}
        value={gameId}
        onValueChange={setGameId}
        options={env.games.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
      />
      {(game?.quickCommands ?? []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-soft">{t('settings.terminal.quick_commands.from_game')}</p>
          {(game?.quickCommands ?? []).map((item) => (
            <label key={item.command} className="flex items-center justify-between gap-3 text-[13px] text-body">
              <span className="truncate">
                {item.label} <span className="font-mono text-[12px] text-mute">{item.command}</span>
              </span>
              <Switch
                checked={!current.hidden.includes(item.command)}
                ariaLabel={item.label}
                onCheckedChange={(visible) => toggleHidden(item.command, visible)}
              />
            </label>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-soft">{t('settings.terminal.quick_commands.custom')}</p>
        {current.custom.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              className="w-32"
              value={item.label}
              aria-label={t('settings.terminal.quick_commands.label_field')}
              placeholder={t('settings.terminal.quick_commands.label_field')}
              onChange={(event) => patchCustom(index, { label: event.target.value })}
            />
            <Input
              className="flex-1 font-mono text-[12px]"
              value={item.command}
              spellCheck={false}
              aria-label={t('settings.terminal.quick_commands.command_field')}
              placeholder={t('settings.terminal.quick_commands.command_field')}
              onChange={(event) => patchCustom(index, { command: event.target.value })}
            />
            <IconButton
              label={t('settings.terminal.quick_commands.remove')}
              onClick={() => save({ ...current, custom: current.custom.filter((_item, i) => i !== index) })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ))}
        <Button
          size="sm"
          disabled={current.custom.length >= MAX_CUSTOM_QUICK_COMMANDS}
          onClick={() => save({ ...current, custom: [...current.custom, { label: '', command: '' }] })}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('settings.terminal.quick_commands.add')}
        </Button>
      </div>
    </div>
  );
};

const BOOLEAN_ROWS: Record<string, keyof TerminalPrefs> = {
  wrap: 'wrapLines',
  timestamps: 'showTimestamps',
  highlight_levels: 'highlightLevels',
  clear_on_restart: 'clearOnRestart'
};

/** Controls of Settings > Terminal. */
export const TerminalSettings: React.FC<SettingControlProps> = ({ id, env }) => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const { terminal } = preferences;

  const booleanKey = BOOLEAN_ROWS[id];
  if (booleanKey) {
    return (
      <Switch
        checked={Boolean(terminal[booleanKey])}
        ariaLabel={t(`settings.terminal.${id}.label`)}
        onCheckedChange={(checked) => update('terminal', { [booleanKey]: checked })}
      />
    );
  }

  switch (id) {
    case 'preview':
      return <TerminalPreview />;
    case 'theme':
      return (
        <div role="radiogroup" aria-label={t('settings.terminal.theme.label')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CONSOLE_THEMES.map((theme) => (
            <ConsoleThemeCard
              key={theme}
              theme={theme}
              selected={terminal.theme === theme}
              onSelect={() => update('terminal', { theme })}
            />
          ))}
        </div>
      );
    case 'font':
      return (
        <Select
          className="w-48"
          ariaLabel={t('settings.terminal.font.label')}
          value={terminal.font}
          onValueChange={(font) => update('terminal', { font: font as TerminalPrefs['font'] })}
          options={CONSOLE_FONTS.map((font) => ({ value: font, label: t(`settings.terminal.font.options.${font}`) }))}
        />
      );
    case 'font_size':
      return (
        <RangeControl
          label={t('settings.terminal.font_size.label')}
          value={terminal.fontSize}
          range={CONSOLE_FONT_SIZE}
          format={(value) => `${value}px`}
          onChange={(fontSize) => update('terminal', { fontSize })}
        />
      );
    case 'line_height':
      return (
        <RangeControl
          label={t('settings.terminal.line_height.label')}
          value={terminal.lineHeight}
          range={CONSOLE_LINE_HEIGHT}
          format={(value) => value.toFixed(2)}
          onChange={(lineHeight) => update('terminal', { lineHeight })}
        />
      );
    case 'rules':
      return <RulesEditor />;
    case 'autoscroll':
      return (
        <SegmentedControl
          ariaLabel={t('settings.terminal.autoscroll.label')}
          value={terminal.autoscroll}
          onValueChange={(autoscroll) => update('terminal', { autoscroll })}
          options={AUTOSCROLL_MODES.map((mode) => ({ value: mode, label: t(`settings.terminal.autoscroll.options.${mode}`) }))}
        />
      );
    case 'buffer':
      return (
        <RangeControl
          label={t('settings.terminal.buffer.label')}
          value={terminal.bufferLines}
          range={CONSOLE_BUFFER}
          format={(value) => String(value)}
          onChange={(bufferLines) => update('terminal', { bufferLines })}
        />
      );
    case 'history':
      return (
        <RangeControl
          label={t('settings.terminal.history.label')}
          value={terminal.historySize}
          range={CONSOLE_HISTORY}
          format={(value) => String(value)}
          onChange={(historySize) => update('terminal', { historySize })}
        />
      );
    case 'quick_commands':
      return <QuickCommandsEditor env={env} />;
    default:
      return null;
  }
};
