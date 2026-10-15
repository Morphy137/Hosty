import { useEffect, useState } from 'react';
import { isTauriRuntime } from '../config/daemon';

/** Installed app version from the Tauri shell; null in browser/dev mode. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let ignore = false;
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (!ignore) setVersion(value);
      })
      .catch(() => {
        // Version label is cosmetic.
      });
    return () => {
      ignore = true;
    };
  }, []);

  return version;
}
