import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { applyAppearance, resolveAppearance } from './appearance';
import { PreferencesContext, type PreferencesContextValue } from './preferencesContext';
import { DEFAULT_PREFERENCES, type AppPreferences, type MotionMode, type PreferenceSection } from './schema';
import { loadPreferences, savePreferences } from './storage';
import { isTauriRuntime } from '../config/daemon';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const MOTION_CONFIG: Record<MotionMode, 'user' | 'always' | 'never'> = {
  system: 'user',
  reduced: 'always',
  full: 'never'
};

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(systemPrefersDark);
  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

/** Native webview zoom in the desktop app (keeps popovers aligned); CSS zoom in the browser. */
async function applyZoom(zoom: number): Promise<void> {
  if (isTauriRuntime()) {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(zoom);
      return;
    } catch {
      // Permission missing or older shell: fall back to CSS.
    }
  }
  document.documentElement.style.setProperty('zoom', zoom === 1 ? '' : String(zoom));
}

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const systemDark = useSystemDark();
  const resolved = useMemo(() => resolveAppearance(preferences, systemDark), [preferences, systemDark]);

  useEffect(() => {
    applyAppearance(resolved);
  }, [resolved]);

  useEffect(() => {
    void applyZoom(resolved.zoom);
  }, [resolved.zoom]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const update = useCallback<PreferencesContextValue['update']>((section, patch) => {
    setPreferences((current) => ({ ...current, [section]: { ...current[section], ...patch } }));
  }, []);

  const replace = useCallback((next: AppPreferences) => setPreferences(next), []);

  const reset = useCallback((section?: PreferenceSection) => {
    setPreferences((current) =>
      section ? { ...current, [section]: DEFAULT_PREFERENCES[section] } : { ...DEFAULT_PREFERENCES }
    );
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ preferences, isDark: resolved.dark, update, replace, reset }),
    [preferences, resolved.dark, update, replace, reset]
  );

  return (
    <PreferencesContext.Provider value={value}>
      <MotionConfig reducedMotion={MOTION_CONFIG[preferences.appearance.motion]}>{children}</MotionConfig>
    </PreferencesContext.Provider>
  );
};
