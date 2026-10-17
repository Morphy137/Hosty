import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Palette, RotateCcw, Search, Server, SlidersHorizontal, Terminal, Wrench } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { usePreferences } from '../../settings/preferencesContext';
import { DEFAULT_PREFERENCES } from '../../settings/schema';
import {
  SETTING_DEFINITIONS,
  SETTINGS_SECTIONS,
  isSettingAvailable,
  isSettingModified,
  matchesSearch,
  settingDefaults,
  settingDescriptionKey,
  settingLabelKey,
  type SettingDefinition,
  type SettingsSectionId
} from '../../settings/registry';
import { GeneralSettings } from './sections/GeneralSettings';
import { AppearanceSettings } from './sections/AppearanceSettings';
import { TerminalSettings } from './sections/TerminalSettings';
import { ServerSettings } from './sections/ServerSettings';
import { AdvancedSettings } from './sections/AdvancedSettings';
import type { SettingControlProps, SettingsEnvironment } from './settingsEnvironment';
import { cn } from '../../utils/cn';

const SECTION_ICONS: Record<SettingsSectionId, React.ReactNode> = {
  general: <SlidersHorizontal className="h-4 w-4" />,
  appearance: <Palette className="h-4 w-4" />,
  terminal: <Terminal className="h-4 w-4" />,
  servers: <Server className="h-4 w-4" />,
  advanced: <Wrench className="h-4 w-4" />
};

const SECTION_CONTROLS: Record<SettingsSectionId, React.FC<SettingControlProps>> = {
  general: GeneralSettings,
  appearance: AppearanceSettings,
  terminal: TerminalSettings,
  servers: ServerSettings,
  advanced: AdvancedSettings
};

const SettingRow: React.FC<{ definition: SettingDefinition; env: SettingsEnvironment }> = ({ definition, env }) => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const Control = SECTION_CONTROLS[definition.section];
  const modified = isSettingModified(definition, preferences, DEFAULT_PREFERENCES);
  const block = definition.layout === 'block';
  const label = t(settingLabelKey(definition));

  const resetButton = modified && definition.prefs && (
    <IconButton
      label={t('settings.reset')}
      size="sm"
      onClick={() => {
        const { section } = definition.prefs!;
        update(section, settingDefaults(definition, DEFAULT_PREFERENCES));
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </IconButton>
  );

  return (
    <div
      data-setting={definition.id}
      className={cn('px-4 py-3.5', block ? 'space-y-3' : 'flex items-center justify-between gap-6')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium text-ink">{label}</h3>
          {modified && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label={t('settings.modified')} />}
          {block && resetButton}
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-mute">{t(settingDescriptionKey(definition))}</p>
      </div>
      <div className={cn(block ? 'w-full' : 'flex shrink-0 items-center gap-1')}>
        {!block && resetButton}
        <Control id={definition.id} env={env} />
      </div>
    </div>
  );
};

const SectionCard: React.FC<{ section: SettingsSectionId; rows: SettingDefinition[]; env: SettingsEnvironment }> = ({
  section,
  rows,
  env
}) => {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={`settings-${section}`} className="space-y-3">
      <div>
        <h2 id={`settings-${section}`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {SECTION_ICONS[section]}
          {t(`settings.sections.${section}.title`)}
        </h2>
        <p className="mt-0.5 text-[12px] text-mute">{t(`settings.sections.${section}.description`)}</p>
      </div>
      <div className="geist-card divide-y divide-hairline">
        {rows.map((definition) => (
          <SettingRow key={definition.id} definition={definition} env={env} />
        ))}
      </div>
    </section>
  );
};

interface SettingsViewProps {
  env: SettingsEnvironment;
  onClose: () => void;
}

/** Full-height settings screen: section list and search on the left, rows on the right. */
export const SettingsView: React.FC<SettingsViewProps> = ({ env, onClose }) => {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSectionId>('general');
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const available = useMemo(
    () => SETTING_DEFINITIONS.filter((definition) => isSettingAvailable(definition, { desktop: env.isDesktop, dev: import.meta.env.DEV })),
    [env.isDesktop]
  );

  const searching = query.trim().length > 0;
  const visibleSections = useMemo(() => {
    const rows = searching
      ? available.filter((definition) =>
          matchesSearch(query, [t(settingLabelKey(definition)), t(settingDescriptionKey(definition)), definition.id])
        )
      : available.filter((definition) => definition.section === section);
    return SETTINGS_SECTIONS.map((id) => ({ id, rows: rows.filter((row) => row.section === id) })).filter(
      (group) => group.rows.length > 0
    );
  }, [available, query, searching, section, t]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [section]);

  // Ctrl+F focuses the search; Escape clears it first, then leaves the settings screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Open dialogs, selects and menus close themselves first.
      if (document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
      if (query) setQuery('');
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, query]);

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label={t('settings.title')} className="flex w-56 shrink-0 flex-col gap-3 border-r border-hairline bg-surface-2 p-3">
        <div className="flex items-center gap-2">
          <IconButton label={t('settings.back')} size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <h1 className="text-[15px] font-semibold text-ink">{t('settings.title')}</h1>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mute" />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.search_placeholder')}
            aria-label={t('settings.search_placeholder')}
            className="h-8 pl-8"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          {SETTINGS_SECTIONS.map((id) => {
            const active = !searching && section === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setQuery('');
                  setSection(id);
                }}
                className={cn(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2.5 text-left text-[13px] transition-colors',
                  active ? 'bg-surface-3 font-medium text-ink' : 'text-body hover:bg-surface-3 hover:text-ink'
                )}
              >
                {SECTION_ICONS[id]}
                {t(`settings.sections.${id}.title`)}
              </button>
            );
          })}
        </div>
      </nav>

      <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-8 p-[var(--page-padding)]">
          {visibleSections.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-mute">{t('settings.no_results', { query })}</p>
          ) : (
            visibleSections.map((group) => <SectionCard key={group.id} section={group.id} rows={group.rows} env={env} />)
          )}
        </div>
      </div>
    </div>
  );
};
