import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, DownloadCloud, Loader2, CheckCircle2 } from 'lucide-react';
import type { ServerLoader } from '../../types/daemon';
import { SERVER_LOADERS } from '../../types/daemon';
import { fetchLoaderVersions } from '../../api/daemonApi';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (params: {
    loader: ServerLoader;
    version: string;
    instanceId: string;
    instanceName: string;
  }) => Promise<void>;
  provisionLogs: string[];
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  provisionLogs
}) => {
  const { t } = useTranslation();
  const [serverName, setServerName] = useState('My Minecraft Server');
  const [instanceId, setInstanceId] = useState('survival-main');
  const [selectedLoader, setSelectedLoader] = useState<ServerLoader>('fabric');
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) setIsLoadingVersions(true);
    });
    fetchLoaderVersions(selectedLoader)
      .then((verList) => {
        if (ignore) return;
        setVersions(verList);
        setSelectedVersion(verList[0] ?? '');
      })
      .catch(() => {
        if (ignore) return;
        setVersions([]);
        setSelectedVersion('');
      })
      .finally(() => {
        if (!ignore) setIsLoadingVersions(false);
      });
    return () => {
      ignore = true;
    };
  }, [isOpen, selectedLoader]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVersion || isInstalling) return;

    setIsInstalling(true);
    try {
      await onInstall({
        loader: selectedLoader,
        version: selectedVersion,
        instanceId: instanceId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        instanceName: serverName.trim()
      });
      setIsInstalling(false);
      onClose();
    } catch {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-white max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] pb-4 shrink-0">
          <div>
            <h2 className="text-[18px] font-semibold text-[#171717] tracking-[-0.4px]">
              {t('create_server.modal_title')}
            </h2>
            <p className="text-[13px] text-[#888888] mt-0.5">
              {t('create_server.modal_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isInstalling}
            className="p-1.5 rounded hover:bg-[#fafafa] text-[#888888] hover:text-[#171717] transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Server Name & ID */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888]">
                {t('create_server.name_label')}
              </label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => {
                  setServerName(e.target.value);
                  setInstanceId(
                    e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
                  );
                }}
                disabled={isInstalling}
                required
                className="w-full h-9 px-3 rounded-[6px] border border-[#ebebeb] text-[13px] text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888]">
                {t('create_server.id_label')}
              </label>
              <input
                type="text"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                disabled={isInstalling}
                required
                className="w-full h-9 px-3 rounded-[6px] border border-[#ebebeb] font-mono text-[12px] text-[#4d4d4d] focus:outline-none focus:border-[#171717]"
              />
            </div>
          </div>

          {/* Loader Selection */}
          <div className="space-y-2">
            <label className="font-mono text-[11px] uppercase text-[#888888]">
              {t('provisioning.loader_label')}
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {SERVER_LOADERS.map((loader) => (
                <button
                  key={loader}
                  type="button"
                  onClick={() => setSelectedLoader(loader)}
                  disabled={isInstalling}
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

          {/* Version Selection */}
          <div className="space-y-1.5">
            <label className="font-mono text-[11px] uppercase text-[#888888] flex items-center justify-between">
              <span>{t('provisioning.version_label')}</span>
              {isLoadingVersions && (
                <span className="flex items-center gap-1 text-[11px] text-[#0070f3]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </span>
              )}
            </label>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              disabled={isInstalling || versions.length === 0}
              className="w-full h-10 px-3 rounded-[6px] border border-[#ebebeb] font-mono text-[13px] text-[#171717] focus:outline-none focus:border-[#171717] disabled:opacity-50"
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  Minecraft {v} ({selectedLoader.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Provisioning Logs Feed */}
          {provisionLogs.length > 0 && (
            <div className="rounded-[6px] bg-[#171717] text-white p-3 font-mono text-[11px] space-y-1 max-h-36 overflow-y-auto">
              <div className="flex items-center justify-between text-[#888888] pb-1 border-b border-[#2e2e2e]">
                <span>{t('provisioning.logs_title')}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#50e3c2]" />
              </div>
              {provisionLogs.map((log, i) => (
                <div key={i} className="text-[#e5e5e5] break-all">
                  {log}
                </div>
              ))}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isInstalling || !selectedVersion}
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
                {t('create_server.submit_button')}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
