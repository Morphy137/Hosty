import { createContext, useContext } from 'react';
import type { AppPreferences, PreferenceSection } from './schema';

export interface PreferencesContextValue {
  preferences: AppPreferences;
  /** Dark mode after resolving `system`. */
  isDark: boolean;
  update: <S extends PreferenceSection>(section: S, patch: Partial<AppPreferences[S]>) => void;
  /** Replaces everything (import). */
  replace: (preferences: AppPreferences) => void;
  /** Restores the defaults of one section, or of everything when no section is given. */
  reset: (section?: PreferenceSection) => void;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return context;
}
