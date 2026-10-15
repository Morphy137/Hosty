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
      <div className="bg-surface border border-hairline rounded-[10px] p-4 shadow-xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-accent/10 dark:bg-accent/15 text-accent-fg flex items-center justify-center shrink-0">
              {updater.downloadComplete ? (
                <CheckCircle2 className="w-4 h-4 text-success-fg" />
              ) : updater.isDownloading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-accent-fg" />
              ) : (
                <ArrowUpCircle className="w-4 h-4 text-accent-fg" />
              )}
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-ink">
                {t('updater.update_available_title')}
              </h4>
              <p className="text-[11px] text-soft">
                {t('updater.update_available_desc', { version: updater.updateVersion ?? '' })}
              </p>
            </div>
          </div>
          {!updater.isDownloading && (
            <button
              type="button"
              onClick={updater.dismissUpdate}
              className="text-mute hover:text-ink p-1 rounded hover:bg-surface-3 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {updater.isDownloading && (
          <div className="space-y-1.5">
            <div className="w-full bg-surface-3 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-accent h-full transition-all duration-200"
                style={{ width: `${updater.downloadProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-mute text-right font-mono">
              {t('updater.downloading', { progress: updater.downloadProgress })}
            </p>
          </div>
        )}

        {updater.downloadComplete ? (
          <p className="text-[11px] font-medium text-success-fg">
            {t('updater.download_complete')}
          </p>
        ) : (
          !updater.isDownloading && (
            <button
              type="button"
              onClick={updater.installUpdate}
              className="w-full py-1.5 px-3 rounded-[6px] bg-ink text-on-ink hover:bg-ink-hover text-[12px] font-medium transition cursor-pointer shadow-xs"
            >
              {t('updater.update_now_btn')}
            </button>
          )
        )}
      </div>
    </div>
  );
};
