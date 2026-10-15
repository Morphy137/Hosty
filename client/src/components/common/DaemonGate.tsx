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
    <div className="h-screen w-screen flex items-center justify-center bg-[#fafafa] dark:bg-[#0a0a0a] p-6 select-none">
      <div className="max-w-[420px] w-full flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-[14px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] p-3 shadow-md flex items-center justify-center mb-6">
          <img src="/logo.svg" alt="Hosty" className="w-full h-full object-contain" />
        </div>

        {state.phase === 'starting' ? (
          <>
            <h1 className="text-[18px] font-bold tracking-[-0.36px] text-[#171717] dark:text-[#ededed]">
              {t('startup.title')}
            </h1>
            <p className="mt-2 text-[13px] text-[#666666] dark:text-[#888888] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('startup.starting')}
            </p>
            {state.attempt > 4 && (
              <p className="mt-1 text-[11px] text-[#999999] dark:text-[#666666]">
                {t('startup.attempt', { current: state.attempt, max: BOOTSTRAP_MAX_ATTEMPTS })}
              </p>
            )}
          </>
        ) : (
          <>
            <AlertTriangle className="w-6 h-6 text-[#e5484d] mb-2" />
            <h1 className="text-[16px] font-semibold text-[#171717] dark:text-[#ededed]">
              {t('startup.failed_title')}
            </h1>
            <p className="mt-2 text-[13px] text-[#666666] dark:text-[#888888] leading-relaxed">
              {t('startup.failed_desc')}
            </p>
            <p className="mt-2 text-[11px] font-mono text-[#999999] dark:text-[#666666] break-all">
              {state.reason}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="h-9 px-4 rounded-[6px] bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#171717] text-[13px] font-medium flex items-center gap-2 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                {t('startup.retry')}
              </button>
              {isTauriRuntime() && (
                <button
                  type="button"
                  onClick={() => void openDaemonLogs()}
                  className="h-9 px-4 rounded-[6px] border border-[#ebebeb] dark:border-[#262626] text-[13px] font-medium text-[#171717] dark:text-[#ededed] flex items-center gap-2 cursor-pointer"
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
