import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import type { AppUpdaterState } from '../../hooks/useAppUpdater';

interface UpdateBannerProps {
  updater: AppUpdaterState;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ updater }) => {
  const { t } = useTranslation();

  if (!updater.updateAvailable && !updater.isDownloading && !updater.downloadComplete) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] rounded-[10px] p-4 shadow-xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-[#0070f3]/10 dark:bg-[#0070f3]/15 text-[#0070f3] dark:text-[#3291ff] flex items-center justify-center shrink-0">
              {updater.downloadComplete ? (
                <CheckCircle2 className="w-4 h-4 text-[#50e3c2]" />
              ) : updater.isDownloading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-[#0070f3]" />
              ) : (
                <ArrowUpCircle className="w-4 h-4 text-[#0070f3]" />
              )}
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-[#171717] dark:text-[#ededed]">
                {t('updater.update_available_title')}
              </h4>
              <p className="text-[11px] text-[#666666] dark:text-[#888888]">
                {t('updater.update_available_desc', { version: updater.updateVersion ?? '' })}
              </p>
            </div>
          </div>
          {!updater.isDownloading && (
            <button
              type="button"
              onClick={updater.dismissUpdate}
              className="text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] p-1 rounded hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {updater.isDownloading && (
          <div className="space-y-1.5">
            <div className="w-full bg-[#f0f0f0] dark:bg-[#222222] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#0070f3] h-full transition-all duration-200"
                style={{ width: `${updater.downloadProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-[#888888] text-right font-mono">
              {t('updater.downloading', { progress: updater.downloadProgress })}
            </p>
          </div>
        )}

        {updater.downloadComplete ? (
          <p className="text-[11px] font-medium text-[#50e3c2]">
            {t('updater.download_complete')}
          </p>
        ) : (
          !updater.isDownloading && (
            <button
              type="button"
              onClick={updater.installUpdate}
              className="w-full py-1.5 px-3 rounded-[6px] bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#171717] hover:bg-[#333333] dark:hover:bg-white text-[12px] font-medium transition cursor-pointer shadow-xs"
            >
              {t('updater.update_now_btn')}
            </button>
          )
        )}
      </div>
    </div>
  );
};
