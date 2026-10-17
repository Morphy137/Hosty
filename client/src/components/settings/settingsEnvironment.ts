import type { LanguageOption } from '../../hooks/useLocales';
import type { AppSettingsState } from '../../hooks/useAppSettings';
import type { GameDriverSummary } from '../../types/daemon';

/** What the settings rows need from the rest of the app (passed down by App). */
export interface SettingsEnvironment {
  games: GameDriverSummary[];
  languages: LanguageOption[];
  currentLanguage: string;
  onChangeLanguage: (code: string) => void;
  appSettings: AppSettingsState;
  /** Running inside the desktop shell (autostart, updater, daemon logs). */
  isDesktop: boolean;
  daemonUrl: string;
  onMock?: () => void;
}

export interface SettingControlProps {
  id: string;
  env: SettingsEnvironment;
}
