import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderOpen, Loader2, RotateCw } from 'lucide-react';
import { BOOTSTRAP_MAX_ATTEMPTS, useDaemonBootstrap } from '../../hooks/useDaemonBootstrap';
import { isTauriRuntime, openDaemonLogs } from '../../config/daemon';

/** Blocks the app until the background daemon is reachable, showing progress or a recoverable error. */
export const DaemonGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { state, retry } = useDaemonBootstrap();

  if (state.phase === 'ready') return <>{children}</>;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-canvas p-6 select-none">
      <div className="max-w-[420px] w-full flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-[14px] bg-surface border border-hairline p-3 shadow-md flex items-center justify-center mb-6">
          <img src="/logo.svg" alt="Hosty" className="w-full h-full object-contain" />
        </div>

        {state.phase === 'starting' ? (
          <>
            <h1 className="text-[18px] font-bold tracking-[-0.36px] text-ink">
              {t('startup.title')}
            </h1>
            <p className="mt-2 text-[13px] text-soft flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('startup.starting')}
            </p>
            {state.attempt > 4 && (
              <p className="mt-1 text-[11px] text-mute">
                {t('startup.attempt', { current: state.attempt, max: BOOTSTRAP_MAX_ATTEMPTS })}
              </p>
            )}
          </>
        ) : (
          <>
            <AlertTriangle className="w-6 h-6 text-danger-fg mb-2" />
            <h1 className="text-[16px] font-semibold text-ink">
              {t('startup.failed_title')}
            </h1>
            <p className="mt-2 text-[13px] text-soft leading-relaxed">
              {t('startup.failed_desc')}
            </p>
            <p className="mt-2 text-[11px] font-mono text-mute break-all">
              {state.reason}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="h-9 px-4 rounded-[6px] bg-ink text-on-ink text-[13px] font-medium flex items-center gap-2 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                {t('startup.retry')}
              </button>
              {isTauriRuntime() && (
                <button
                  type="button"
                  onClick={() => void openDaemonLogs()}
                  className="h-9 px-4 rounded-[6px] border border-hairline text-[13px] font-medium text-ink flex items-center gap-2 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('startup.view_logs')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
