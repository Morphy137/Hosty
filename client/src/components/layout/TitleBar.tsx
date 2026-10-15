import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '../../utils/cn';

type AppWindow = import('@tauri-apps/api/window').Window;

const CONTROL_CLASSES =
  'flex h-full w-11 items-center justify-center text-body transition-colors duration-[var(--duration-fast)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hairline';
const HOVER_CLASSES = 'hover:bg-hairline hover:text-ink active:bg-surface-3';

/**
 * Custom window chrome for the desktop shell (the native frame is disabled in tauri.conf.json).
 * Only rendered inside Tauri; the browser dev mode keeps the page without a fake title bar.
 */
export const TitleBar: React.FC = () => {
  const { t } = useTranslation();
  const [appWindow, setAppWindow] = useState<AppWindow | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const current = getCurrentWindow();
      if (disposed) return;
      setAppWindow(current);
      setIsMaximized(await current.isMaximized());
      unlisten = await current.onResized(async () => {
        if (!disposed) setIsMaximized(await current.isMaximized());
      });
    })().catch(() => {
      // Window API unavailable (e.g. restricted capabilities): controls simply stay inert.
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const minimize = useCallback(() => void appWindow?.minimize(), [appWindow]);
  const toggleMaximize = useCallback(() => void appWindow?.toggleMaximize(), [appWindow]);
  const close = useCallback(() => void appWindow?.close(), [appWindow]);

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-hairline bg-surface"
    >
      <div data-tauri-drag-region className="min-w-0 flex-1 self-stretch" />

      <div className="flex h-full items-center">
        <button
          type="button"
          aria-label={t('titlebar.minimize')}
          onClick={minimize}
          className={cn(CONTROL_CLASSES, HOVER_CLASSES)}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
          onClick={toggleMaximize}
          className={cn(CONTROL_CLASSES, HOVER_CLASSES)}
        >
          {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          type="button"
          aria-label={t('titlebar.close')}
          onClick={close}
          className={cn(CONTROL_CLASSES, 'hover:bg-danger hover:text-white')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
