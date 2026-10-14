import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Users,
  Package,
  FileCode,
  Sliders,
  Play,
  Square,
  RotateCcw,
  Sparkles,
  Globe,
  Plus,
  FolderInput,
  Server,
  ChevronDown,
  Moon,
  Sun
} from 'lucide-react';
import type { DaemonAction, InstanceInfo, ServerStatus } from '../../types/daemon';
import { changeLanguage, type SupportedLanguage } from '../../i18n';
import type { Theme } from '../../hooks/useTheme';

export type TabId = 'overview' | 'players' | 'mod_files' | 'mods' | 'properties';

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  status: ServerStatus;
  mockEnabled: boolean;
  onSendAction: (action: DaemonAction, data?: string) => boolean;
  onRestart: () => void;
  instances: InstanceInfo[];
  activeInstanceId: string;
  onSelectInstance: (id: string) => Promise<void>;
  onOpenCreateModal: () => void;
  onOpenImportModal: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  status,
  mockEnabled,
  onSendAction,
  onRestart,
  instances,
  activeInstanceId,
  onSelectInstance,
  onOpenCreateModal,
  onOpenImportModal,
  theme,
  onToggleTheme
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language?.startsWith('es') ? 'es' : 'en') as SupportedLanguage;

  const toggleLanguage = () => {
    const nextLang: SupportedLanguage = currentLang === 'en' ? 'es' : 'en';
    changeLanguage(nextLang);
  };

  return (
    <header className="border-b border-[#ebebeb] dark:border-[#262626] bg-white dark:bg-[#0a0a0a] px-8 pt-4 select-none transition-colors">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between pb-4 gap-4">
        {/* Left Branding & Instance Dropdown */}
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo.svg"
            alt="MC-Nexus"
            className="w-7 h-7 rounded-[6px] shrink-0 object-contain shadow-xs"
          />
          <span className="text-[#ebebeb] dark:text-[#333333] text-lg font-light shrink-0">/</span>
          <span className="text-[14px] font-semibold tracking-[-0.28px] text-[#171717] dark:text-[#ededed] shrink-0">
            {t('header.title')}
          </span>
          <span className="text-[#ebebeb] dark:text-[#333333] text-lg font-light shrink-0">/</span>

          {/* Instance Selector Dropdown */}
          <div className="relative flex items-center shrink-0">
            <Server className="w-3.5 h-3.5 text-[#888888] absolute left-2.5 pointer-events-none" />
            <select
              value={activeInstanceId}
              onChange={(e) => onSelectInstance(e.target.value)}
              className="h-8 pl-8 pr-7 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#d4d4d4] dark:hover:border-[#383838] text-[13px] font-medium text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed] cursor-pointer appearance-none min-w-[200px] transition"
              title={t('header.instance_tooltip')}
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id} className="dark:bg-[#141414]">
                  {inst.name} (:{inst.port})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] absolute right-2.5 pointer-events-none" />
          </div>

          {/* New / Import Buttons */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="h-8 px-2.5 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#171717] dark:text-[#ededed] flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs"
            title={t('header.new_server')}
          >
            <Plus className="w-3.5 h-3.5 text-[#0070f3]" />
            <span className="hidden sm:inline">{t('header.new_server')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="h-8 px-2.5 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#4d4d4d] dark:text-[#a1a1a1] flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs"
            title={t('header.import_server')}
          >
            <FolderInput className="w-3.5 h-3.5 text-[#888888]" />
            <span className="hidden sm:inline">{t('header.import_server')}</span>
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mock Button (Icon only, compact) */}
          {mockEnabled && (
            <button
              type="button"
              onClick={() => onSendAction('MOCK')}
              className="h-8 w-8 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626] flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
              title={t('header.mock_button')}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#888888] dark:text-[#a1a1a1]" />
            </button>
          )}

          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="h-8 px-2.5 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-mono font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer uppercase min-w-[58px] shrink-0 shadow-2xs"
            title={t('header.language')}
          >
            <Globe className="w-3.5 h-3.5 text-[#888888] shrink-0" />
            <span>{currentLang}</span>
          </button>

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="h-8 w-8 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] border border-[#ebebeb] dark:border-[#262626] flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
            title={theme === 'dark' ? t('header.theme_light') : t('header.theme_dark')}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-[#f5a623]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[#888888]" />
            )}
          </button>

          <div className="h-4 w-[1px] bg-[#ebebeb] dark:bg-[#262626] mx-1 shrink-0" />

          {/* Start Server */}
          <button
            type="button"
            onClick={() => onSendAction('START')}
            disabled={status === 'ONLINE' || status === 'STARTING'}
            className="h-8 px-3.5 rounded-[6px] bg-[#171717] dark:bg-[#ededed] hover:bg-[#333333] dark:hover:bg-[#ffffff] disabled:opacity-40 text-white dark:text-[#000000] text-[13px] font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer min-w-[135px] shrink-0 shadow-xs"
          >
            <Play className="w-3 h-3 fill-current shrink-0" />
            <span>{t('overview.controls.start')}</span>
          </button>

          {/* Stop Server */}
          <button
            type="button"
            onClick={() => onSendAction('STOP')}
            disabled={status === 'OFFLINE'}
            className="h-8 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] disabled:opacity-40 text-[#171717] dark:text-[#ededed] border border-[#ebebeb] dark:border-[#262626] text-[13px] font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer min-w-[110px] shrink-0 shadow-2xs"
          >
            <Square className="w-3 h-3 fill-current shrink-0" />
            <span>{t('overview.controls.stop')}</span>
          </button>

          {/* Restart Server */}
          <button
            type="button"
            onClick={onRestart}
            disabled={status === 'OFFLINE'}
            className="h-8 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] disabled:opacity-40 text-[#171717] dark:text-[#ededed] border border-[#ebebeb] dark:border-[#262626] text-[13px] font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer min-w-[115px] shrink-0 shadow-2xs"
            title={t('overview.controls.restart')}
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>{t('overview.controls.restart')}</span>
          </button>

          {/* Kill Server */}
          <button
            type="button"
            onClick={() => onSendAction('KILL')}
            disabled={status === 'OFFLINE'}
            className="h-8 w-8 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f7d4d6]/40 dark:hover:bg-[#381215] disabled:opacity-40 text-[#ee0000] border border-[#ebebeb] dark:border-[#262626] flex items-center justify-center transition cursor-pointer shrink-0 shadow-2xs"
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
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'overview'
              ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed] font-medium'
              : 'border-transparent text-[#888888] dark:text-[#707070] hover:text-[#171717] dark:hover:text-[#ededed]'
          }`}
        >
          <Activity className="w-4 h-4" />
          {t('nav.overview')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('players')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'players'
              ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed] font-medium'
              : 'border-transparent text-[#888888] dark:text-[#707070] hover:text-[#171717] dark:hover:text-[#ededed]'
          }`}
        >
          <Users className="w-4 h-4" />
          {t('nav.players')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('mod_files')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'mod_files'
              ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed] font-medium'
              : 'border-transparent text-[#888888] dark:text-[#707070] hover:text-[#171717] dark:hover:text-[#ededed]'
          }`}
        >
          <Package className="w-4 h-4" />
          {t('nav.mod_files')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('mods')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'mods'
              ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed] font-medium'
              : 'border-transparent text-[#888888] dark:text-[#707070] hover:text-[#171717] dark:hover:text-[#ededed]'
          }`}
        >
          <FileCode className="w-4 h-4" />
          {t('nav.mods')}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('properties')}
          className={`py-2.5 text-[14px] tracking-[-0.28px] border-b-2 transition cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'properties'
              ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed] font-medium'
              : 'border-transparent text-[#888888] dark:text-[#707070] hover:text-[#171717] dark:hover:text-[#ededed]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          {t('nav.properties')}
        </button>
      </nav>
    </header>
  );
};
