import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Input, NumberInput } from '../../ui/Input';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/toastContext';
import { openAppFolder, toErrorPayload, type AppFolderId, type AppSettings } from '../../../api/daemonApi';
import type { SettingControlProps, SettingsEnvironment } from '../settingsEnvironment';

/** Bounds accepted by the daemon for the default memory of new servers. */
const MEMORY_LIMITS_MB = { min: 512, max: 65_536, step: 512 } as const;
/** Shown when custom memory is first turned on. */
const FALLBACK_MEMORY_MB = 4096;
const FOLDER_IDS: AppFolderId[] = ['instances', 'games', 'locales'];

function useSaveAppSetting(env: SettingsEnvironment) {
  const { t } = useTranslation();
  const { toast } = useToast();
  return async (patch: Partial<AppSettings>) => {
    try {
      await env.appSettings.save(patch);
    } catch (error) {
      const payload = toErrorPayload(error);
      toast({
        title: t('settings.servers.save_failed'),
        description: t(`errors.${payload.code}`, { defaultValue: payload.message }),
        variant: 'error'
      });
    }
  };
}

const MemoryDefault: React.FC<{ env: SettingsEnvironment; settings: AppSettings }> = ({ env, settings }) => {
  const { t } = useTranslation();
  const save = useSaveAppSetting(env);
  const custom = settings.defaultMemoryMb !== null;
  // Value being typed; `null` shows the stored one.
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? settings.defaultMemoryMb ?? FALLBACK_MEMORY_MB;

  return (
    <div className="flex items-center gap-3">
      {custom && (
        <div className="flex items-center gap-1.5">
          <NumberInput
            className="w-24"
            aria-label={t('settings.servers.default_memory.label')}
            min={MEMORY_LIMITS_MB.min}
            max={MEMORY_LIMITS_MB.max}
            step={MEMORY_LIMITS_MB.step}
            value={value}
            onValueChange={setDraft}
            onBlur={() => {
              void save({ defaultMemoryMb: Math.round(value) });
              setDraft(null);
            }}
          />
          <span className="text-[12px] text-mute">MB</span>
        </div>
      )}
      <label className="flex items-center gap-2 text-[12px] text-body">
        <Switch
          checked={custom}
          ariaLabel={t('settings.servers.default_memory.custom')}
          onCheckedChange={(next) => void save({ defaultMemoryMb: next ? Math.round(value) : null })}
        />
        {t('settings.servers.default_memory.custom')}
      </label>
    </div>
  );
};

const JavaDefault: React.FC<{ env: SettingsEnvironment; settings: AppSettings }> = ({ env, settings }) => {
  const { t } = useTranslation();
  const save = useSaveAppSetting(env);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? settings.defaultJavaPath;

  return (
    <Input
      className="w-72 font-mono text-[12px]"
      value={value}
      spellCheck={false}
      aria-label={t('settings.servers.default_java.label')}
      placeholder={t('settings.servers.default_java.placeholder')}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (value.trim() !== settings.defaultJavaPath) void save({ defaultJavaPath: value.trim() });
        setDraft(null);
      }}
    />
  );
};

const Folders: React.FC<{ env: SettingsEnvironment }> = ({ env }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const folders = env.appSettings.data?.folders;

  const open = (id: AppFolderId) =>
    openAppFolder(id).catch((error: unknown) => {
      const payload = toErrorPayload(error);
      toast({
        title: t('settings.servers.folders.open_failed'),
        description: t(`errors.${payload.code}`, { defaultValue: payload.message }),
        variant: 'error'
      });
    });

  return (
    <div className="space-y-2">
      {FOLDER_IDS.map((id) => (
        <div key={id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-ink">{t(`settings.servers.folders.${id}`)}</p>
            <p className="truncate font-mono text-[11px] text-mute" title={folders?.[id]}>
              {folders?.[id] ?? ''}
            </p>
          </div>
          <Button size="sm" onClick={() => void open(id)}>
            <FolderOpen className="h-3.5 w-3.5" />
            {t('settings.servers.folders.open')}
          </Button>
        </div>
      ))}
      <p className="text-[12px] text-mute">{t('settings.servers.folders.hint')}</p>
    </div>
  );
};

/** Controls of Settings > Servers (stored by the daemon, applied to servers created afterwards). */
export const ServerSettings: React.FC<SettingControlProps> = ({ id, env }) => {
  const { t } = useTranslation();
  const save = useSaveAppSetting(env);
  const settings = env.appSettings.data?.settings;

  if (!settings) return <span className="text-[12px] text-mute">{t('settings.servers.unavailable')}</span>;

  switch (id) {
    case 'default_memory':
      return <MemoryDefault env={env} settings={settings} />;
    case 'default_java':
      return <JavaDefault env={env} settings={settings} />;
    case 'default_autostart':
      return (
        <Switch
          checked={settings.defaultAutostart}
          ariaLabel={t('settings.servers.default_autostart.label')}
          onCheckedChange={(defaultAutostart) => void save({ defaultAutostart })}
        />
      );
    case 'folders':
      return <Folders env={env} />;
    default:
      return null;
  }
};
