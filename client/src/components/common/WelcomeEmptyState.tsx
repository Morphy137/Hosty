import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';

interface WelcomeEmptyStateProps {
  onCreateServer: () => void;
}

export const WelcomeEmptyState: React.FC<WelcomeEmptyStateProps> = ({ onCreateServer }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
      <div className="max-w-[620px] w-full flex flex-col items-center">
        {/* Large Logo */}
        <div className="relative mb-6">
          <img src="/logo.svg" alt="Hosty" className="h-20 w-20 rounded-full object-cover shadow-md" />
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

        <button
          type="button"
          onClick={onCreateServer}
          className="mt-8 inline-flex h-11 cursor-pointer items-center gap-2 rounded-[8px] bg-ink px-6 text-[14px] font-medium text-on-ink shadow-xs transition hover:bg-ink-hover"
        >
          {t('onboarding.get_started')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
