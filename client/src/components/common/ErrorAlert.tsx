import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, X } from 'lucide-react';
import type { DaemonErrorPayload } from '../../types/daemon';

interface ErrorAlertProps {
  error: DaemonErrorPayload | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const DEFAULT_AUTO_DISMISS_MS = 5000;

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [error, onDismiss, autoDismissMs]);

  if (!error) return null;

  const translationKey = `errors.${error.code}`;
  const translatedMessage = t(translationKey, { defaultValue: error.message || t('errors.UNKNOWN') });

  return (
    <div className="fixed top-5 right-6 z-50 max-w-md w-[calc(100vw-3rem)] pointer-events-auto animate-in slide-in-from-top-2 fade-in duration-200">
      <div className="rounded-[8px] bg-white dark:bg-[#141414] border border-[#f7d4d6] dark:border-[#ee0000]/40 p-3.5 shadow-xl flex items-start justify-between gap-3 text-[13px] text-[#ee0000] dark:text-[#ff6b6b]">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertCircle className="w-4 h-4 shrink-0 text-[#ee0000] mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <span className="inline-block font-mono text-[11px] font-semibold uppercase bg-[#fff0f0] dark:bg-[#381215] px-1.5 py-0.5 rounded-[4px] border border-[#f7d4d6] dark:border-[#ee0000]/30 mr-1.5">
              {error.code}
            </span>
            <span className="text-[#171717] dark:text-[#ededed] leading-snug break-words">
              {translatedMessage}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-[4px] hover:bg-[#fff0f0] dark:hover:bg-[#262626] text-[#888888] hover:text-[#ee0000] dark:hover:text-white transition cursor-pointer shrink-0 ml-1"
          aria-label={t('errors.dismiss')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
