import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, X } from 'lucide-react';
import type { DaemonErrorPayload } from '../../types/daemon';

interface ErrorAlertProps {
  error: DaemonErrorPayload | null;
  onDismiss: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ error, onDismiss }) => {
  const { t } = useTranslation();
  if (!error) return null;

  const translationKey = `errors.${error.code}`;
  const translatedMessage = t(translationKey, { defaultValue: error.message || t('errors.UNKNOWN') });

  return (
    <div className="mx-8 mt-4 p-3 rounded-[6px] bg-[#fff5f5] border border-[#f7d4d6] flex items-center justify-between text-[13px] text-[#ee0000] animate-in fade-in duration-200">
      <div className="flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 shrink-0 text-[#ee0000]" />
        <span className="font-medium font-mono text-[12px] uppercase bg-[#fde8e8] px-1.5 py-0.5 rounded">
          {error.code}
        </span>
        <span>{translatedMessage}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded hover:bg-[#fed7d7] text-[#ee0000] transition cursor-pointer"
        aria-label={t('errors.dismiss')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
