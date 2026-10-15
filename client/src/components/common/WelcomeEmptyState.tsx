import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlusCircle, FolderInput, Sparkles } from 'lucide-react';

interface WelcomeEmptyStateProps {
  onCreateServer: () => void;
  onImportServer: () => void;
}

export const WelcomeEmptyState: React.FC<WelcomeEmptyStateProps> = ({
  onCreateServer,
  onImportServer
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
      <div className="max-w-[620px] w-full flex flex-col items-center">
        {/* Large Logo */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-[16px] bg-surface border border-hairline p-3 shadow-md flex items-center justify-center">
            <img
              src="/logo.svg"
              alt="Hosty"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-accent text-white shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Headings */}
        <h1 className="text-[24px] font-bold tracking-[-0.48px] text-ink">
          {t('onboarding.welcome_title')}
        </h1>
        <p className="text-[14px] text-soft mt-2 max-w-[480px] leading-relaxed">
          {t('onboarding.welcome_desc')}
        </p>

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-8 text-left">
          {/* Card 1: Create */}
          <button
            type="button"
            onClick={onCreateServer}
            className="group p-5 rounded-[10px] bg-surface hover:bg-surface-2 border border-hairline hover:border-accent transition-all shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-[8px] bg-accent/10 dark:bg-accent/15 text-accent-fg flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <PlusCircle className="w-5 h-5" />
              </div>
              <h2 className="text-[15px] font-semibold text-ink group-hover:text-accent-fg transition-colors">
                {t('onboarding.create_server_title')}
              </h2>
              <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
                {t('onboarding.create_server_desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-[12px] font-medium text-accent-fg">
              <span>{t('onboarding.create_server_btn')}</span>
              <span>→</span>
            </div>
          </button>

          {/* Card 2: Import */}
          <button
            type="button"
            onClick={onImportServer}
            className="group p-5 rounded-[10px] bg-surface hover:bg-surface-2 border border-hairline hover:border-ink transition-all shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-[8px] bg-surface-3 text-ink flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <FolderInput className="w-5 h-5" />
              </div>
              <h2 className="text-[15px] font-semibold text-ink group-hover:text-ink transition-colors">
                {t('onboarding.import_server_title')}
              </h2>
              <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
                {t('onboarding.import_server_desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-[12px] font-medium text-ink">
              <span>{t('onboarding.import_server_btn')}</span>
              <span className="text-mute group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
