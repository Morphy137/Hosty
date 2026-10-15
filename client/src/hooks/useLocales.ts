import { useCallback, useEffect, useState } from 'react';
import i18n from 'i18next';
import { fetchLocale, fetchLocales, type LocaleInfo } from '../api/daemonApi';
import { BUILTIN_LANGUAGES, changeLanguage, registerLocalePack } from '../i18n';
import type { SocketConnectionState } from '../types/daemon';

export interface LanguageOption {
  code: string;
  name: string;
  builtin: boolean;
}

const BUILTIN_OPTIONS: LanguageOption[] = BUILTIN_LANGUAGES.map((language) => ({ ...language, builtin: true }));

/** Built-in languages plus community packs found in the daemon's locales folder. */
export function useLocales(connectionState: SocketConnectionState) {
  const [packs, setPacks] = useState<LocaleInfo[]>([]);
  const [current, setCurrent] = useState<string>(i18n.language || 'en');

  const loadPack = useCallback(async (code: string): Promise<boolean> => {
    try {
      const { _meta: _ignored, ...resources } = await fetchLocale(code);
      registerLocalePack(code, resources);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (connectionState !== 'open') return;
    let ignore = false;
    fetchLocales()
      .then(async ({ locales }) => {
        if (ignore) return;
        setPacks(locales.filter((locale) => !BUILTIN_OPTIONS.some((builtin) => builtin.code === locale.code)));
        // Restore a saved community language once its pack is available.
        const saved = i18n.language;
        if (saved && locales.some((locale) => locale.code === saved) && (await loadPack(saved))) {
          await i18n.changeLanguage(saved);
          if (!ignore) setCurrent(saved);
        }
      })
      .catch(() => {
        // Translation packs are optional.
      });
    return () => {
      ignore = true;
    };
  }, [connectionState, loadPack]);

  const select = useCallback(
    async (code: string) => {
      const isBuiltin = BUILTIN_OPTIONS.some((option) => option.code === code);
      if (!isBuiltin && !(await loadPack(code))) return;
      changeLanguage(code);
      setCurrent(code);
    },
    [loadPack]
  );

  const options: LanguageOption[] = [
    ...BUILTIN_OPTIONS,
    ...packs.map((pack) => ({ code: pack.code, name: pack.name, builtin: false }))
  ];

  return { options, current, select };
}
