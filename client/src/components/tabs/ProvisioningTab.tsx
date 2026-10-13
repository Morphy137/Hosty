import React from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { ServerLoader, ServerStatus } from '../../types/daemon';
import { SERVER_LOADERS } from '../../types/daemon';

interface ProvisioningTabProps {
  selectedLoader: ServerLoader;
  onSelectLoader: (loader: ServerLoader) => void;
  availableVersions: string[];
  selectedVersion: string;
  onSelectVersion: (version: string) => void;
  isInstalling: boolean;
  provisionLogs: string[];
  serverStatus: ServerStatus;
  onInstall: () => void;
}

export const ProvisioningTab: React.FC<ProvisioningTabProps> = ({
  selectedLoader,
  onSelectLoader,
  availableVersions,
  selectedVersion,
  onSelectVersion,
  isInstalling,
  provisionLogs,
  serverStatus,
  onInstall
}) => {
  const { t } = useTranslation();
  const isServerRunning = serverStatus !== 'OFFLINE';

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden max-w-[1100px] w-full mx-auto">
      <div className="col-span-6 geist-card p-6 flex flex-col justify-between">
        <div className="space-y-6">
          <div>
            <span className="font-mono text-[11px] uppercase text-[#888888]">
              Automated Setup
            </span>
            <h2 className="text-[20px] font-semibold tracking-[-0.6px] text-[#171717] mt-1">
              {t('provisioning.title')}
            </h2>
            <p className="text-[14px] text-[#4d4d4d] mt-1">
              {t('provisioning.subtitle')}
            </p>
          </div>

          {/* Warning if server running */}
          {isServerRunning && (
            <div className="p-3 rounded-[6px] bg-[#fffbf0] border border-[#ffefcf] flex items-center gap-2.5 text-[13px] text-[#f5a623]">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#f5a623]" />
              <span>{t('provisioning.server_must_be_offline')}</span>
            </div>
          )}

          {/* Loader Selector (3-up cards) */}
          <div className="space-y-2">
            <label className="font-mono text-[12px] uppercase text-[#888888]">
              {t('provisioning.loader_label')}
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {SERVER_LOADERS.map((loader) => (
                <button
                  key={loader}
                  type="button"
                  onClick={() => onSelectLoader(loader)}
                  className={`p-3 rounded-[6px] border text-left transition cursor-pointer ${
                    selectedLoader === loader
                      ? 'bg-[#171717] text-white border-[#171717]'
                      : 'bg-white text-[#171717] border-[#ebebeb] hover:bg-[#fafafa]'
                  }`}
                >
                  <div className="font-mono text-[13px] font-medium uppercase">
                    {loader}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 line-clamp-2 ${
                      selectedLoader === loader ? 'text-[#a1a1a1]' : 'text-[#888888]'
                    }`}
                  >
                    {loader === 'fabric'
                      ? t('provisioning.loader_fabric_desc')
                      : loader === 'paper'
                      ? t('provisioning.loader_paper_desc')
                      : t('provisioning.loader_vanilla_desc')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Version Dropdown */}
          <div className="space-y-2">
            <label className="font-mono text-[12px] uppercase text-[#888888]">
              {t('provisioning.version_label')}
            </label>
            <select
              value={selectedVersion}
              onChange={(e) => onSelectVersion(e.target.value)}
              disabled={isInstalling || availableVersions.length === 0}
              className="w-full h-10 px-3 rounded-[6px] bg-white border border-[#ebebeb] font-mono text-[13px] text-[#171717] focus:outline-none focus:border-[#171717] disabled:opacity-50"
            >
              {availableVersions.map((v) => (
                <option key={v} value={v}>
                  Minecraft {v} ({selectedLoader.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={onInstall}
          disabled={isInstalling || !selectedVersion || isServerRunning}
          className="w-full h-10 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-40 text-white text-[14px] font-medium flex items-center justify-center gap-2 transition cursor-pointer"
        >
          {isInstalling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('provisioning.installing')}
            </>
          ) : (
            <>
              <DownloadCloud className="w-4 h-4" />
              {t('provisioning.install_button')}
            </>
          )}
        </button>
      </div>

      {/* Provisioning Output Log */}
      <div className="col-span-6 rounded-[8px] bg-[#171717] text-white p-5 flex flex-col justify-between font-mono">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-[#2e2e2e]">
            <span className="text-[12px] text-[#888888]">
              {t('provisioning.logs_title')}
            </span>
            <CheckCircle2 className="w-4 h-4 text-[#50e3c2]" />
          </div>
          <div className="mt-4 space-y-2 text-[12px] leading-relaxed max-h-[360px] overflow-y-auto">
            {provisionLogs.length === 0 ? (
              <div className="text-[#888888]">
                {t('provisioning.ready_hint')} Target directory: /instances/default
              </div>
            ) : (
              provisionLogs.map((msg, i) => (
                <div key={i} className="text-[#e5e5e5]">
                  {msg}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-[#2e2e2e] text-[11px] text-[#888888] flex justify-between">
          <span>Auto-EULA: Enabled</span>
          <span>Target: server.jar</span>
        </div>
      </div>
    </div>
  );
};
