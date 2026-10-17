import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/toastContext';
import { usePreferences } from '../../../settings/preferencesContext';
import { isLaunchAtLoginEnabled, setLaunchAtLogin } from '../../../config/autostart';
import type { SettingControlProps } from '../settingsEnvironment';

const LaunchAtLoginSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    isLaunchAtLoginEnabled()
      .then((value) => {
        if (!ignore) setEnabled(value);
      })
      .catch(() => {
        if (!ignore) setEnabled(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleChange = async (next: boolean) => {
    setBusy(true);
    try {
      await setLaunchAtLogin(next);
      setEnabled(next);
    } catch (error) {
      toast({
        title: t('settings.general.launch_at_login.failed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'error'
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Switch
      checked={enabled ?? false}
      disabled={enabled === null}
      busy={busy}
      ariaLabel={t('settings.general.launch_at_login.label')}
      onCheckedChange={(next) => void handleChange(next)}
    />
  );
};

/** Controls of Settings > General. */
export const GeneralSettings: React.FC<SettingControlProps> = ({ id, env }) => {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const { general } = preferences;

  switch (id) {
    case 'language':
      return (
        <Select
          className="w-48"
          ariaLabel={t('settings.general.language.label')}
          value={env.currentLanguage}
          onValueChange={env.onChangeLanguage}
          options={env.languages.map((language) => ({ value: language.code, label: language.name }))}
        />
      );
    case 'launch_at_login':
      return <LaunchAtLoginSwitch />;
    case 'check_updates':
      return (
        <Switch
          checked={general.checkUpdatesOnStart}
          ariaLabel={t('settings.general.check_updates.label')}
          onCheckedChange={(checkUpdatesOnStart) => update('general', { checkUpdatesOnStart })}
        />
      );
    case 'confirm_stop':
      return (
        <Switch
          checked={general.confirmStopWithPlayers}
          ariaLabel={t('settings.general.confirm_stop.label')}
          onCheckedChange={(confirmStopWithPlayers) => update('general', { confirmStopWithPlayers })}
        />
      );
    default:
      return null;
  }
};
