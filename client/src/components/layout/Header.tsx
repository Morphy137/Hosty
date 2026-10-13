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
  Server
} from 'lucide-react';
import type { DaemonAction, InstanceInfo, ServerStatus } from '../../types/daemon';
import { changeLanguage, type SupportedLanguage } from '../../i18n';

export type TabId = 'overview' | 'players' | 'mod_files' | 'mods' | 'properties';

interface HeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  status: ServerStatus;
  mockEnabled: boolean;
  onSendAction: (action: DaemonAction, data?: string) => boolean;
  instances: InstanceInfo[];
  activeInstanceId: string;
  onSelectInstance: (id: string) => Promise<void>;
  onOpenCreateModal: () => void;
  onOpenImportModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  status,
  mockEnabled,
  onSendAction,
  instances,
  activeInstanceId,
  onSelectInstance,
  onOpenCreateModal,
  onOpenImportModal
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language?.startsWith('es') ? 'es' : 'en') as SupportedLanguage;

  const toggleLanguage = () => {
    const nextLang: SupportedLanguage = currentLang === 'en' ? 'es' : 'en';
    changeLanguage(nextLang);
  };

  return (
    <header className="border-b border-[#ebebeb] bg-white px-8 pt-4 select-none">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between pb-4">
        {/* Left Branding, Instance Dropdown & Status */}
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="MC-Nexus"
            className="w-7 h-7 rounded-[6px] shrink-0 object-contain shadow-xs"
          />
          <span className="text-[#ebebeb] text-lg font-light">/</span>
          <span className="text-[14px] font-semibold tracking-[-0.28px] text-[#171717] shrink-0">
            {t('header.title')}
          </span>
          <span className="text-[#ebebeb] text-lg font-light">/</span>

          {/* Instance Selector Dropdown */}
          <div className="relative flex items-center">
            <Server className="w-3.5 h-3.5 text-[#888888] absolute left-2.5 pointer-events-none" />
            <select
              value={activeInstanceId}
              onChange={(e) => onSelectInstance(e.target.value)}
              disabled={status !== 'OFFLINE'}
              className="h-8 pl-8 pr-7 rounded-[6px] bg-[#fafafa] hover:bg-[#f5f5f5] border border-[#ebebeb] text-[13px] font-medium text-[#171717] focus:outline-none focus:border-[#171717] cursor-pointer disabled:opacity-50 appearance-none min-w-[180px]"
              title={t('header.instance_tooltip')}
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} ({inst.port})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[#888888] absolute right-2.5 pointer-events-none">
              ▼
            </span>
          </div>

          {/* New / Import Buttons */}
          <button
            type="button"
            onClick={onOpenCreateModal}
            disabled={status !== 'OFFLINE'}
            className="h-8 px-2.5 rounded-[6px] bg-white hover:bg-[#fafafa] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center gap-1 transition cursor-pointer disabled:opacity-40 shrink-0"
            title={t('header.new_server')}
          >
            <Plus className="w-3.5 h-3.5 text-[#0070f3]" />
            <span className="hidden sm:inline">{t('header.new_server')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            disabled={status !== 'OFFLINE'}
            className="h-8 px-2.5 rounded-[6px] bg-white hover:bg-[#fafafa] border border-[#ebebeb] text-[12px] font-medium text-[#4d4d4d] flex items-center gap-1 transition cursor-pointer disabled:opacity-40 shrink-0"
            title={t('header.import_server')}
          >
            <FolderInput className="w-3.5 h-3.5 text-[#888888]" />
            <span className="hidden sm:inline">{t('header.import_server')}</span>
          </button>

          {/* Server Status Pill (fixed width to prevent layout shift) */}
          <div className="flex items-center justify-center gap-2 px-2.5 py-0.5 rounded-full bg-[#fafafa] border border-[#ebebeb] min-w-[90px] shrink-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
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

        {/* Right Controls - Fixed min-widths to prevent CLS */}
        <div className="flex items-center gap-2 shrink-0">
          {mockEnabled && (
            <button
              type="button"
              onClick={() => onSendAction('MOCK')}
              className="h-8 px-3 rounded-[6px] bg-white hover:bg-[#fafafa] text-[#4d4d4d] border border-[#ebebeb] text-[13px] font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer min-w-[155px] shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#888888] shrink-0" />
              <span>{t('header.mock_button')}</span>
            </button>
          )}

          {/* Language Switcher */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="h-8 px-2.5 rounded-[6px] bg-white hover:bg-[#fafafa] text-[#4d4d4d] border border-[#ebebeb] text-[12px] font-mono font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer uppercase min-w-[58px] shrink-0"
            title={t('header.language')}
          >
            <Globe className="w-3.5 h-3.5 text-[#888888] shrink-0" />
            <span>{currentLang}</span>
          </button>

          <div className="h-4 w-[1px] bg-[#ebebeb] mx-1 shrink-0" />

          {/* Start Server (Fixed min-width) */}
          <button
            type="button"
            onClick={() => onSendAction('START')}
            disabled={status === 'ONLINE' || status === 'STARTING'}
            className="h-8 px-3.5 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-40 text-white text-[13px] font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer min-w-[135px] shrink-0"
          >
            <Play className="w-3 h-3 fill-current shrink-0" />
            <span>{t('overview.controls.start')}</span>
          </button>

          {/* Stop Server (Fixed min-width) */}
          <button
            type="button"
            onClick={() => onSendAction('STOP')}
            disabled={status === 'OFFLINE'}
            className="h-8 px-3 rounded-[6px] bg-white hover:bg-[#f5f5f5] disabled:opacity-40 text-[#171717] border border-[#ebebeb] text-[13px] font-medium tracking-[-0.28px] flex items-center justify-center gap-1.5 transition cursor-pointer min-w-[110px] shrink-0"
          >
            <Square className="w-3 h-3 fill-current shrink-0" />
            <span>{t('overview.controls.stop')}</span>
          </button>

          {/* Kill Server */}
          <button
            type="button"
            onClick={() => onSendAction('KILL')}
            disabled={status === 'OFFLINE'}
            className="h-8 w-8 rounded-[6px] bg-white hover:bg-[#f7d4d6]/40 disabled:opacity-40 text-[#ee0000] border border-[#ebebeb] flex items-center justify-center transition cursor-pointer shrink-0"
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
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
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
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
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
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
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
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
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
              ? 'border-[#171717] text-[#171717] font-medium'
              : 'border-transparent text-[#888888] hover:text-[#171717]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          {t('nav.properties')}
        </button>
      </nav>
    </header>
  );
};
