import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  DownloadCloud,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Upload,
  FileText,
  ChevronDown
} from 'lucide-react';
import type { ServerLoader, InstanceSettings } from '../../types/daemon';
import { SERVER_LOADERS, LOADER_METADATA } from '../../types/daemon';
import { fetchLoaderVersions } from '../../api/daemonApi';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (params: {
    loader: ServerLoader;
    version: string;
    instanceId: string;
    instanceName: string;
    settings?: Partial<InstanceSettings>;
  }) => Promise<void>;
  onUploadJar: (params: {
    file: File;
    instanceId: string;
    instanceName: string;
    settings?: Partial<InstanceSettings>;
  }) => Promise<void>;
  provisionLogs: string[];
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  onUploadJar,
  provisionLogs
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [serverName, setServerName] = useState('My Minecraft Server');
  const [instanceId, setInstanceId] = useState('survival-main');
  const [motd, setMotd] = useState('A Minecraft Server');
  const [port, setPort] = useState(25565);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [ramValue, setRamValue] = useState(4);
  const [ramUnit, setRamUnit] = useState<'GB' | 'MB'>('GB');

  const [selectedLoader, setSelectedLoader] = useState<ServerLoader>('fabric');
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Manual Jar Upload State
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [useCustomJar, setUseCustomJar] = useState(false);

  const currentLoaderMeta = LOADER_METADATA[selectedLoader];
  const requiresManualJar = !currentLoaderMeta.isAutomatic;

  useEffect(() => {
    if (!isOpen) return;

    if (!currentLoaderMeta.isAutomatic) {
      Promise.resolve().then(() => {
        setVersions([]);
        setSelectedVersion('');
        setIsLoadingVersions(false);
      });
      return;
    }

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
  }, [isOpen, selectedLoader, currentLoaderMeta.isAutomatic]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.jar')) {
      setAttachedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.jar')) {
      setAttachedFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInstalling) return;

    const safeId = instanceId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const safeName = serverName.trim();

    const calculatedMaxRamMb = ramUnit === 'GB' ? ramValue * 1024 : ramValue;
    const calculatedMinRamMb = Math.min(1024, calculatedMaxRamMb);
    const settings: Partial<InstanceSettings> = {
      motd: motd.trim(),
      port: Number(port) || 25565,
      maxPlayers: Number(maxPlayers) || 20,
      minRamMb: calculatedMinRamMb,
      maxRamMb: calculatedMaxRamMb
    };

    setIsInstalling(true);
    try {
      if (requiresManualJar || (useCustomJar && attachedFile)) {
        if (!attachedFile) return;
        await onUploadJar({
          file: attachedFile,
          instanceId: safeId,
          instanceName: safeName,
          settings
        });
      } else {
        if (!selectedVersion) return;
        await onInstall({
          loader: selectedLoader,
          version: selectedVersion,
          instanceId: safeId,
          instanceName: safeName,
          settings
        });
      }
      setIsInstalling(false);
      onClose();
    } catch {
      setIsInstalling(false);
    }
  };

  const isSubmitDisabled =
    isInstalling ||
    (requiresManualJar && !attachedFile) ||
    (!requiresManualJar && useCustomJar && !attachedFile) ||
    (!requiresManualJar && !useCustomJar && !selectedVersion);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-white dark:bg-[#111111] border border-[#ebebeb] dark:border-[#262626] max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] dark:border-[#262626] pb-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-[#171717] dark:text-[#ededed] tracking-[-0.3px]">
              {t('create_server.modal_title')}
            </h2>
            <p className="text-[13px] text-[#888888] dark:text-[#a1a1a1] mt-0.5">
              {t('create_server.modal_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isInstalling}
            className="p-1.5 rounded-[4px] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Server Name & ID */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
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
                className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                {t('create_server.id_label')}
              </label>
              <input
                type="text"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                disabled={isInstalling}
                required
                className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#4d4d4d] dark:text-[#a1a1a1] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
              />
            </div>
          </div>

          {/* MOTD */}
          <div className="space-y-1.5">
            <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
              {t('edit_server.motd_label')}
            </label>
            <input
              type="text"
              value={motd}
              onChange={(e) => setMotd(e.target.value)}
              disabled={isInstalling}
              placeholder="A Minecraft Server"
              className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[13px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
          </div>

          {/* Quick Customization Row: Port, Max Players, RAM */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                {t('edit_server.port_label')}
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                disabled={isInstalling}
                className="w-full h-9 px-2.5 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                {t('edit_server.max_players_label')}
              </label>
              <input
                type="number"
                min={1}
                max={9999}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                disabled={isInstalling}
                className="w-full h-9 px-2.5 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                {t('edit_server.ram_label')}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={ramValue}
                  onChange={(e) => setRamValue(Math.max(1, Number(e.target.value)))}
                  disabled={isInstalling}
                  className="w-full h-9 px-2.5 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                />
                <select
                  value={ramUnit}
                  onChange={(e) => setRamUnit(e.target.value as 'GB' | 'MB')}
                  disabled={isInstalling}
                  className="h-9 px-1.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] focus:outline-none"
                >
                  <option value="GB">GB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
            </div>
          </div>

          {/* Loader Selection Grid */}
          <div className="space-y-2">
            <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1] flex items-center justify-between">
              <span>{t('provisioning.loader_label')}</span>
              <span className="text-[11px] text-[#888888] dark:text-[#a1a1a1]">
                {requiresManualJar ? t('provisioning.manual_loader_badge') : t('provisioning.auto_loader_badge')}
              </span>
            </label>

            <div className="grid grid-cols-4 gap-2">
              {SERVER_LOADERS.map((loader) => {
                const meta = LOADER_METADATA[loader];
                const isSelected = selectedLoader === loader;

                return (
                  <button
                    key={loader}
                    type="button"
                    onClick={() => {
                      setSelectedLoader(loader);
                      if (!meta.isAutomatic) {
                        setUseCustomJar(true);
                      }
                    }}
                    disabled={isInstalling}
                    className={`p-2.5 rounded-[4px] border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#171717] dark:bg-[#ededed] text-white dark:text-[#171717] border-[#171717] dark:border-[#ededed]'
                        : 'bg-white dark:bg-[#141414] text-[#171717] dark:text-[#ededed] border-[#ebebeb] dark:border-[#262626] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[12px] font-semibold uppercase">
                        {meta.name}
                      </span>
                      <span
                        className={`font-mono text-[9px] uppercase px-1 py-0.5 rounded-[2px] ${
                          isSelected
                            ? 'bg-white/20 dark:bg-black/20 text-white dark:text-[#171717]'
                            : meta.isAutomatic
                            ? 'bg-[#50e3c2]/15 text-[#0070f3] dark:text-[#50e3c2]'
                            : 'bg-[#fafafa] dark:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[#888888] dark:text-[#a1a1a1]'
                        }`}
                      >
                        {meta.isAutomatic ? 'Auto' : 'Jar'}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] mt-1 capitalize ${
                        isSelected ? 'text-[#a1a1a1] dark:text-[#4d4d4d]' : 'text-[#888888] dark:text-[#a1a1a1]'
                      }`}
                    >
                      {meta.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AUTOMATED DOWNLOAD: Version Selection Dropdown */}
          {!requiresManualJar && !useCustomJar && (
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1] flex items-center justify-between">
                <span>{t('provisioning.version_label')}</span>
                {isLoadingVersions && (
                  <span className="flex items-center gap-1 text-[11px] text-[#0070f3] dark:text-[#3291ff]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('provisioning.loading_versions')}
                  </span>
                )}
              </label>

              <div className="relative flex items-center">
                <select
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  disabled={isInstalling || versions.length === 0}
                  className="w-full h-9 pl-3 pr-8 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#d4d4d4] dark:hover:border-[#404040] font-mono text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed] cursor-pointer disabled:opacity-50 appearance-none transition"
                >
                  {versions.map((v) => (
                    <option key={v} value={v}>
                      Minecraft {v} ({selectedLoader.toUpperCase()})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#888888] dark:text-[#a1a1a1] absolute right-3 pointer-events-none" />
              </div>

              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => setUseCustomJar(true)}
                  className="text-[11px] text-[#0070f3] dark:text-[#3291ff] hover:underline cursor-pointer"
                >
                  {t('provisioning.switch_to_custom_jar')}
                </button>
              </div>
            </div>
          )}

          {/* MANUAL JAR / ATTACHMENT SECTION */}
          {(requiresManualJar || useCustomJar) && (
            <div className="space-y-3 p-3.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626]">
              {/* Guidance & Official Download URL */}
              {currentLoaderMeta.officialUrl && (
                <div className="flex items-start justify-between gap-3 text-[12px] text-[#4d4d4d] dark:text-[#a1a1a1]">
                  <p>
                    {t('provisioning.manual_download_instructions', {
                      loader: currentLoaderMeta.name
                    })}
                  </p>
                  <a
                    href={currentLoaderMeta.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-2.5 py-1 rounded-[4px] bg-white dark:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] hover:border-[#171717] dark:hover:border-[#ededed] text-[11px] font-medium text-[#171717] dark:text-[#ededed] flex items-center gap-1 transition"
                  >
                    <span>{t('provisioning.visit_official_site')}</span>
                    <ExternalLink className="w-3 h-3 text-[#888888] dark:text-[#a1a1a1]" />
                  </a>
                </div>
              )}

              {/* Drag and Drop / File Picker Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#d4d4d4] dark:border-[#333333] hover:border-[#171717] dark:hover:border-[#ededed] rounded-[4px] p-4 text-center cursor-pointer transition bg-white dark:bg-[#0d0d0d]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jar"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {attachedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-[#0070f3] dark:text-[#3291ff]" />
                    <div className="text-left">
                      <div className="font-mono text-[12px] font-medium text-[#171717] dark:text-[#ededed]">
                        {attachedFile.name}
                      </div>
                      <div className="font-mono text-[10px] text-[#888888] dark:text-[#a1a1a1]">
                        {(attachedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-5 h-5 text-[#888888] dark:text-[#a1a1a1] mx-auto" />
                    <div className="text-[12px] font-medium text-[#171717] dark:text-[#ededed]">
                      {t('provisioning.upload_jar_dropzone')}
                    </div>
                    <div className="text-[11px] text-[#888888] dark:text-[#a1a1a1]">
                      {t('provisioning.upload_jar_hint')}
                    </div>
                  </div>
                )}
              </div>

              {!requiresManualJar && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomJar(false);
                      setAttachedFile(null);
                    }}
                    className="text-[11px] text-[#888888] dark:text-[#a1a1a1] hover:text-[#171717] dark:hover:text-[#ededed] cursor-pointer"
                  >
                    {t('provisioning.switch_to_auto_download')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Provisioning Logs Feed */}
          {provisionLogs.length > 0 && (
            <div className="rounded-[4px] bg-[#171717] dark:bg-[#0a0a0a] border dark:border-[#262626] text-white p-3 font-mono text-[11px] space-y-1 max-h-32 overflow-y-auto">
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
            disabled={isSubmitDisabled}
            className="w-full h-10 rounded-[4px] bg-[#171717] hover:bg-[#333333] dark:bg-[#ededed] dark:hover:bg-[#ffffff] text-white dark:text-[#171717] disabled:opacity-40 text-[13px] font-medium flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
          >
            {isInstalling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('provisioning.installing')}
              </>
            ) : requiresManualJar || (useCustomJar && attachedFile) ? (
              <>
                <Upload className="w-4 h-4" />
                {t('provisioning.create_and_upload')}
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
