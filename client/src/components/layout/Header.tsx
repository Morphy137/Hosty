import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Sliders,
  FileCode,
  DownloadCloud,
  Play,
  Square,
  RotateCcw,
  Sparkles,
  Globe
} from 'lucide-react';
import type { DaemonAction, ServerStatus } from '../../types/daemon';
import { changeLanguage, type SupportedLanguage } from '../../i18n';

export type TabId = 'overview' | 'properties' | 'mods' | 'provisioning';

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  status: ServerStatus;
  mockEnabled: boolean;
  onSendAction: (action: DaemonAction, data?: string) => boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  status,
  mockEnabled,
  onSendAction
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language?.startsWith('es') ? 'es' : 'en') as SupportedLanguage;

  const toggleLanguage = () => {
    const nextLang: SupportedLanguage = currentLang === 'en' ? 'es' : 'en';
    changeLanguage(nextLang);
  };

  return (
    <header className="border-b border-[#ebebeb] bg-white px-8 pt-4">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between pb-4">
        {/* Left Branding & Path */}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-[6px] bg-[#171717] text-white flex items-center justify-center font-mono text-xs font-medium">
            ▲
          </div>
          <span className="text-[#ebebeb] text-lg font-light">/</span>
          <span className="text-[14px] font-medium tracking-[-0.28px] text-[#171717]">
            {t('header.title')}
          </span>
          <span className="text-[#ebebeb] text-lg font-light">/</span>
          <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-[#fafafa] border border-[#ebebeb]">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'ONLINE'
                  ? 'bg-[#0070f3]'
                  : status === 'STARTING'
                  ? 'bg-[#f5a623]'
                  : 'bg-[#888888]'
              }`}
            />
            <span className="font-mono text-[11px] text-[#4d4d4d]">{status}</span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {mockEnabled && (
            <button
              type="button"
              onClick={() => onSendAction('MOCK')}
              className="h-8 px-3 rounded-[6px] bg-white hover:bg-[#fafafa] text-[#4d4d4d] border border-[#ebebeb] text-[13px] font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#888888]" />
              {t('header.mock_button')}
            </button>
          )}

          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="h-8 px-2.5 rounded-[6px] bg-white hover:bg-[#fafafa] text-[#4d4d4d] border border-[#ebebeb] text-[12px] font-mono font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer uppercase"
            title={t('header.language')}
          >
            <Globe className="w-3.5 h-3.5 text-[#888888]" />
            {currentLang}
          </button>

          <div className="h-4 w-[1px] bg-[#ebebeb] mx-1" />

          <button
            type="button"
            onClick={() => onSendAction('START')}
            disabled={status === 'ONLINE' || status === 'STARTING'}
            className="h-8 px-3.5 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-40 text-white text-[13px] font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            {t('overview.controls.start')}
          </button>

          <button
            type="button"
            onClick={() => onSendAction('STOP')}
            disabled={status === 'OFFLINE'}
            className="h-8 px-3 rounded-[6px] bg-white hover:bg-[#f5f5f5] disabled:opacity-40 text-[#171717] border border-[#ebebeb] text-[13px] font-medium tracking-[-0.28px] flex items-center gap-1.5 transition cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            {t('overview.controls.stop')}
          </button>

          <button
            type="button"
            onClick={() => onSendAction('KILL')}
            disabled={status === 'OFFLINE'}
            className="h-8 px-2.5 rounded-[6px] bg-white hover:bg-[#f7d4d6]/40 disabled:opacity-40 text-[#ee0000] border border-[#ebebeb] text-[13px] font-medium transition cursor-pointer"
            title={t('overview.controls.kill')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <nav className="max-w-[1400px] mx-auto flex items-center gap-6 -mb-[1px]">
        <button
          type="button"
          onClick={() => onTabChange('overview')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
          }`}
        >
          <Activity className="w-4 h-4" />
          {t('nav.overview')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('properties')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'properties'
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          {t('nav.properties')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('mods')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'mods'
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
          }`}
        >
          <FileCode className="w-4 h-4" />
          {t('nav.mods')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('provisioning')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'provisioning'
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
          }`}
        >
          <DownloadCloud className="w-4 h-4" />
          {t('nav.provisioning')}
        </button>
      </nav>
    </header>
  );
};
