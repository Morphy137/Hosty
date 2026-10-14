import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Upload,
  Trash2,
  Server,
  Layers,
  Sparkles,
  AlertTriangle,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import type { InstanceInfo, InstanceSettings, ServerStatus } from '../../types/daemon';
import { getInstanceIconUrl, uploadInstanceIcon, deleteInstanceIcon } from '../../api/daemonApi';

interface EditServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceInfo | null;
  serverStatus: ServerStatus;
  onSaveSettings: (id: string, patch: Partial<InstanceSettings>) => Promise<InstanceInfo>;
  onRefreshInstances: () => Promise<void>;
}

type TabKey = 'general' | 'advanced';

const AIKAR_FLAGS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:+AlwaysPreTouch',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1'
];

interface EditModalContentProps {
  instance: InstanceInfo;
  serverStatus: ServerStatus;
  onClose: () => void;
  onSaveSettings: (id: string, patch: Partial<InstanceSettings>) => Promise<InstanceInfo>;
  onRefreshInstances: () => Promise<void>;
}

const EditServerModalContent: React.FC<EditModalContentProps> = ({
  instance,
  serverStatus,
  onClose,
  onSaveSettings,
  onRefreshInstances
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Form Fields initialized directly from props
  const [name, setName] = useState(instance.name || instance.id);
  const [motd, setMotd] = useState(instance.motd || '');
  const [port, setPort] = useState(instance.port || 25565);
  const [maxPlayers, setMaxPlayers] = useState(instance.maxPlayers || 20);

  const initialMaxMb = instance.maxRamMb || 4096;
  const isExactGb = initialMaxMb % 1024 === 0 && initialMaxMb >= 1024;
  const [ramValue, setRamValue] = useState(isExactGb ? initialMaxMb / 1024 : initialMaxMb);
  const [ramUnit, setRamUnit] = useState<'GB' | 'MB'>(isExactGb ? 'GB' : 'MB');

  const [forceSaveOnStop, setForceSaveOnStop] = useState(instance.forceSaveOnStop !== false);
  const [autostart, setAutostart] = useState(instance.autostart || false);
  const [javaPath, setJavaPath] = useState(instance.javaPath || '');
  const [jvmArgsString, setJvmArgsString] = useState(instance.jvmArgs?.join(' ') || '');

  // Icon preview and upload state
  const [iconPreview, setIconPreview] = useState<string | null>(
    instance.hasIcon ? getInstanceIconUrl(instance.id) : null
  );
  const [pendingIconBase64, setPendingIconBase64] = useState<string | null>(null);
  const [removeIconPending, setRemoveIconPending] = useState(false);

  const handleCopyPath = () => {
    navigator.clipboard.writeText(instance.dir);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const handleIconSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setPendingIconBase64(base64);
        setIconPreview(base64);
        setRemoveIconPending(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveIcon = () => {
    setIconPreview(null);
    setPendingIconBase64(null);
    setRemoveIconPending(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApplyAikarFlags = () => {
    const existing = jvmArgsString
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const combined = Array.from(new Set([...existing, ...AIKAR_FLAGS])).join(' ');
    setJvmArgsString(combined);
  };

  const calculatedMaxRamMb = ramUnit === 'GB' ? ramValue * 1024 : ramValue;
  const calculatedMinRamMb = Math.min(1024, calculatedMaxRamMb);

  const parsedJvmArgs = jvmArgsString
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const startupPreview = `java -Xms${calculatedMinRamMb}M -Xmx${calculatedMaxRamMb}M ${parsedJvmArgs.join(
    ' '
  )} -jar server.jar nogui`.replace(/\s+/g, ' ');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      if (pendingIconBase64) {
        await uploadInstanceIcon(instance.id, pendingIconBase64);
      } else if (removeIconPending && instance.hasIcon) {
        await deleteInstanceIcon(instance.id);
      }

      await onSaveSettings(instance.id, {
        name: name.trim() || instance.id,
        motd: motd.trim(),
        port: Number(port) || 25565,
        maxPlayers: Number(maxPlayers) || 20,
        minRamMb: calculatedMinRamMb,
        maxRamMb: calculatedMaxRamMb,
        forceSaveOnStop,
        autostart,
        javaPath: javaPath.trim(),
        jvmArgs: parsedJvmArgs
      });

      await onRefreshInstances();
      onClose();
    } catch {
      // Handled via parent
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-white dark:bg-[#111111] border border-[#ebebeb] dark:border-[#262626] max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] dark:border-[#262626] pb-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-[#171717] dark:text-[#ededed] tracking-[-0.3px]">
              {t('edit_server.modal_title')}
            </h2>
            <p className="text-[13px] text-[#888888] dark:text-[#a1a1a1] mt-0.5">
              {t('edit_server.modal_subtitle', { name: instance.name })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-[4px] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-4 border-b border-[#ebebeb] dark:border-[#262626] pb-2 text-[13px] font-medium shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`pb-1.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed]'
                : 'border-transparent text-[#888888] dark:text-[#a1a1a1] hover:text-[#171717] dark:hover:text-[#ededed]'
            }`}
          >
            <Server className="w-4 h-4" />
            {t('edit_server.tab_general')}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advanced')}
            className={`pb-1.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'advanced'
                ? 'border-[#171717] dark:border-[#ededed] text-[#171717] dark:text-[#ededed]'
                : 'border-transparent text-[#888888] dark:text-[#a1a1a1] hover:text-[#171717] dark:hover:text-[#ededed]'
            }`}
          >
            <Layers className="w-4 h-4" />
            {t('edit_server.tab_advanced')}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activeTab === 'general' && (
            <div className="grid grid-cols-12 gap-5">
              {/* Left Column (7 cols) */}
              <div className="col-span-7 space-y-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.name_label')}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.motd_label')}
                  </label>
                  <input
                    type="text"
                    value={motd}
                    onChange={(e) => setMotd(e.target.value)}
                    placeholder="A Minecraft Server"
                    className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[13px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                  />
                </div>

                {/* Folder Path Display */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.folder_path')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={instance.dir}
                      readOnly
                      className="flex-1 h-8 px-2.5 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] text-[#666666] dark:text-[#a1a1a1] select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="h-8 px-2 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] flex items-center justify-center transition cursor-pointer"
                      title="Copy Path"
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-[#50e3c2]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="pt-2 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-[#171717] dark:text-[#ededed]">
                    <input
                      type="checkbox"
                      checked={forceSaveOnStop}
                      onChange={(e) => setForceSaveOnStop(e.target.checked)}
                      className="w-4 h-4 rounded border-[#ebebeb] dark:border-[#262626] accent-[#171717] dark:accent-[#ededed] focus:ring-0 cursor-pointer"
                    />
                    <span>{t('edit_server.force_save_label')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-[#171717] dark:text-[#ededed]">
                    <input
                      type="checkbox"
                      checked={autostart}
                      onChange={(e) => setAutostart(e.target.checked)}
                      className="w-4 h-4 rounded border-[#ebebeb] dark:border-[#262626] accent-[#171717] dark:accent-[#ededed] focus:ring-0 cursor-pointer"
                    />
                    <span>{t('edit_server.autostart_label')}</span>
                  </label>
                </div>
              </div>

              {/* Right Column (5 cols) */}
              <div className="col-span-5 space-y-4">
                {/* Server Icon Box */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.icon_label')}
                  </label>
                  <div className="p-3 rounded-[4px] border border-[#ebebeb] dark:border-[#262626] bg-[#fafafa] dark:bg-[#141414] flex items-center gap-3">
                    <div className="w-16 h-16 rounded-[4px] border border-[#d4d4d4] dark:border-[#333333] bg-white dark:bg-[#0a0a0a] flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt="Server Icon"
                          className="w-full h-full object-contain image-rendering-pixelated"
                        />
                      ) : (
                        <Server className="w-8 h-8 text-[#a1a1a1]" />
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png"
                        onChange={handleIconSelected}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-7 px-2.5 rounded-[4px] bg-white dark:bg-[#1f1f1f] hover:bg-[#f5f5f5] dark:hover:bg-[#262626] border border-[#ebebeb] dark:border-[#333333] text-[11px] font-medium text-[#171717] dark:text-[#ededed] flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3 h-3 text-[#0070f3]" />
                        <span>{t('edit_server.upload_icon')}</span>
                      </button>

                      {iconPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveIcon}
                          className="h-6 px-2 rounded-[4px] text-[11px] font-medium text-[#ee0000] dark:text-[#ff6b6b] hover:bg-[#f7d4d6]/40 dark:hover:bg-[#381215]/50 flex items-center gap-1 transition cursor-pointer self-start"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t('edit_server.remove_icon')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.icon_hint')}
                  </p>
                </div>

                {/* RAM Allocation */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.ram_label')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={ramUnit === 'GB' ? 1 : 512}
                      max={ramUnit === 'GB' ? 64 : 65536}
                      step={ramUnit === 'GB' ? 1 : 256}
                      value={ramValue}
                      onChange={(e) => setRamValue(Math.max(1, Number(e.target.value)))}
                      className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                    />
                    <select
                      value={ramUnit}
                      onChange={(e) => {
                        const nextUnit = e.target.value as 'GB' | 'MB';
                        if (nextUnit === 'MB' && ramUnit === 'GB') {
                          setRamValue(ramValue * 1024);
                        } else if (nextUnit === 'GB' && ramUnit === 'MB') {
                          setRamValue(Math.max(1, Math.round(ramValue / 1024)));
                        }
                        setRamUnit(nextUnit);
                      }}
                      className="h-9 px-2 rounded-[4px] bg-[#fafafa] dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] focus:outline-none cursor-pointer"
                    >
                      <option value="GB">GB</option>
                      <option value="MB">MB</option>
                    </select>
                  </div>
                </div>

                {/* Server Port & Max Players */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                      {t('edit_server.port_label')}
                    </label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
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
                      className="w-full h-9 px-2.5 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[13px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-4">
              {/* Java Path Override */}
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                  {t('edit_server.java_path_label')}
                </label>
                <input
                  type="text"
                  value={javaPath}
                  onChange={(e) => setJavaPath(e.target.value)}
                  placeholder="e.g. C:\Program Files\Java\jdk-21\bin\java.exe"
                  className="w-full h-9 px-3 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                />
                <p className="text-[11px] text-[#888888] dark:text-[#a1a1a1]">
                  {t('edit_server.java_path_hint')}
                </p>
              </div>

              {/* Startup Line / JVM Flags */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                    {t('edit_server.jvm_args_label')}
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyAikarFlags}
                    className="text-[11px] text-[#0070f3] dark:text-[#3291ff] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-[#0070f3] dark:text-[#3291ff]" />
                    {t('edit_server.apply_aikar_preset')}
                  </button>
                </div>
                <textarea
                  value={jvmArgsString}
                  onChange={(e) => setJvmArgsString(e.target.value)}
                  placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
                  rows={3}
                  className="w-full p-2.5 rounded-[4px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
                />
              </div>

              {/* Startup Line Preview */}
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
                  {t('edit_server.startup_preview_label')}
                </label>
                <div className="p-3 rounded-[4px] bg-[#171717] dark:bg-[#0a0a0a] border border-transparent dark:border-[#262626] text-white dark:text-[#ededed] font-mono text-[11px] break-all leading-relaxed">
                  {startupPreview}
                </div>
              </div>
            </div>
          )}

          {/* Warning banner when server is online */}
          {serverStatus !== 'OFFLINE' && (
            <div className="p-2.5 rounded-[4px] bg-[#fff7ed] dark:bg-[#2d1b09] border border-[#ffedd5] dark:border-[#7c2d12] flex items-center gap-2 text-[12px] text-[#c2410c] dark:text-[#fdba74]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('edit_server.running_warning')}</span>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#ebebeb] dark:border-[#262626]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-9 px-4 rounded-[4px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[13px] font-medium text-[#4d4d4d] dark:text-[#a1a1a1] transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-9 px-5 rounded-[4px] bg-[#171717] hover:bg-[#333333] dark:bg-[#ededed] dark:hover:bg-[#ffffff] text-white dark:text-[#171717] disabled:opacity-40 text-[13px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t('common.save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const EditServerModal: React.FC<EditServerModalProps> = ({
  isOpen,
  onClose,
  instance,
  serverStatus,
  onSaveSettings,
  onRefreshInstances
}) => {
  if (!isOpen || !instance) return null;

  return (
    <EditServerModalContent
      key={instance.id}
      instance={instance}
      serverStatus={serverStatus}
      onClose={onClose}
      onSaveSettings={onSaveSettings}
      onRefreshInstances={onRefreshInstances}
    />
  );
};
