import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlusCircle, FolderInput, X, Sparkles } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateServer: () => void;
  onImportServer: () => void;
  canDismiss?: boolean;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onCreateServer,
  onImportServer,
  canDismiss = false
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626] rounded-[10px] w-full max-w-[620px] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-[#ebebeb] dark:border-[#262626] flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo.svg"
              alt="Hosty"
              className="w-10 h-10 rounded-[8px] object-contain shadow-xs shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-bold tracking-[-0.36px] text-[#171717] dark:text-[#ededed]">
                  {t('onboarding.welcome_title')}
                </h2>
                <span className="px-1.5 py-0.5 rounded-[4px] bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3291ff] font-mono text-[10px] font-semibold uppercase">
                  Hosty
                </span>
              </div>
              <p className="text-[13px] text-[#666666] dark:text-[#888888] mt-0.5">
                {t('onboarding.welcome_subtitle')}
              </p>
            </div>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[6px] text-[#888888] hover:text-[#171717] dark:hover:text-white hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content: 2 Cards */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Create Server */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onCreateServer();
            }}
            className="group relative flex flex-col items-start p-5 rounded-[8px] bg-[#fafafa] dark:bg-[#141414] hover:bg-white dark:hover:bg-[#191919] border border-[#ebebeb] dark:border-[#262626] hover:border-[#0070f3] dark:hover:border-[#0070f3] transition-all text-left shadow-2xs hover:shadow-md cursor-pointer"
          >
            <div className="w-10 h-10 rounded-[8px] bg-[#0070f3]/10 dark:bg-[#0070f3]/15 border border-[#0070f3]/25 flex items-center justify-center mb-3 text-[#0070f3] dark:text-[#3291ff] group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#171717] dark:text-[#ededed] group-hover:text-[#0070f3] dark:group-hover:text-[#3291ff] transition-colors">
              {t('onboarding.create_server_title')}
            </h3>
            <p className="text-[12px] text-[#666666] dark:text-[#888888] mt-1.5 leading-relaxed line-clamp-3">
              {t('onboarding.create_server_desc')}
            </p>
            <div className="mt-4 pt-3 border-t border-[#ebebeb] dark:border-[#262626] w-full flex items-center justify-between text-[12px] font-medium text-[#0070f3] dark:text-[#3291ff]">
              <span>{t('onboarding.create_server_btn')}</span>
              <Sparkles className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>

          {/* Card 2: Import Server */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onImportServer();
            }}
            className="group relative flex flex-col items-start p-5 rounded-[8px] bg-[#fafafa] dark:bg-[#141414] hover:bg-white dark:hover:bg-[#191919] border border-[#ebebeb] dark:border-[#262626] hover:border-[#171717] dark:hover:border-[#ededed] transition-all text-left shadow-2xs hover:shadow-md cursor-pointer"
          >
            <div className="w-10 h-10 rounded-[8px] bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#2b2b2b] flex items-center justify-center mb-3 text-[#171717] dark:text-[#ededed] group-hover:scale-105 transition-transform">
              <FolderInput className="w-5 h-5" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#171717] dark:text-[#ededed] group-hover:text-[#171717] dark:group-hover:text-white transition-colors">
              {t('onboarding.import_server_title')}
            </h3>
            <p className="text-[12px] text-[#666666] dark:text-[#888888] mt-1.5 leading-relaxed line-clamp-3">
              {t('onboarding.import_server_desc')}
            </p>
            <div className="mt-4 pt-3 border-t border-[#ebebeb] dark:border-[#262626] w-full flex items-center justify-between text-[12px] font-medium text-[#171717] dark:text-[#ededed]">
              <span>{t('onboarding.import_server_btn')}</span>
              <span className="text-[#888888] group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#fafafa] dark:bg-[#111111] border-t border-[#ebebeb] dark:border-[#262626] flex items-center justify-between text-[12px] text-[#888888]">
          <span>Hosty • Multi-game Server Supervisor</span>
          <span>v0.1.1</span>
        </div>
      </div>
    </div>
  );
};
