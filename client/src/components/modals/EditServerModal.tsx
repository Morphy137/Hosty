import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '../ui/Select';
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
  Check,
  Activity
} from 'lucide-react';
import type { GameDriverSummary, InstanceInfo, InstanceSettings, JvmFlagPreset, ServerStatus } from '../../types/daemon';
import { iconSizeFor, resizeToServerIcon } from '../../utils/serverIcon';
import { ServerIconHint } from '../common/ServerIconHint';
import {
  getInstanceIconUrl,
  uploadInstanceIcon,
  deleteInstanceIcon,
  installInstanceBridge
} from '../../api/daemonApi';

interface EditServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceInfo | null;
  serverStatus: ServerStatus;
  onSaveSettings: (id: string, patch: Partial<InstanceSettings>) => Promise<InstanceInfo>;
  onRefreshInstances: () => Promise<void>;
  jvmFlagPresets?: JvmFlagPreset[];
  /** Game of the instance: decides the icon size and whether the game shows it too. */
  game?: GameDriverSummary;
}

type TabKey = 'general' | 'advanced' | 'bridge';


interface EditModalContentProps {
  instance: InstanceInfo;
  serverStatus: ServerStatus;
  onClose: () => void;
  onSaveSettings: (id: string, patch: Partial<InstanceSettings>) => Promise<InstanceInfo>;
  onRefreshInstances: () => Promise<void>;
  jvmFlagPresets: JvmFlagPreset[];
  game?: GameDriverSummary;
}

const EditServerModalContent: React.FC<EditModalContentProps> = ({
  instance,
  serverStatus,
  onClose,
  onSaveSettings,
  onRefreshInstances,
  jvmFlagPresets,
  game
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Form Fields initialized directly from props
  const [name, setName] = useState(instance.name || instance.id);
  const [motd, setMotd] = useState(instance.motd || '');
  const [port, setPort] = useState(instance.port || game?.defaultPort || 0);
  const [maxPlayers, setMaxPlayers] = useState(instance.maxPlayers || game?.defaultMaxPlayers || 1);
  // Each section only exists when the game declares what it needs.
  const usesJava = Boolean(game?.supportsCustomJava);
  const hasBridge = (game?.bridgeLoaders?.length ?? 0) > 0;
  const hasMotd = Boolean(game?.configSync?.map.motd);

  const initialMaxMb = instance.maxRamMb || 4096;
  const isExactGb = initialMaxMb % 1024 === 0 && initialMaxMb >= 1024;
  const [ramValue, setRamValue] = useState(isExactGb ? initialMaxMb / 1024 : initialMaxMb);
  const [ramUnit, setRamUnit] = useState<'GB' | 'MB'>(isExactGb ? 'GB' : 'MB');

  const [forceSaveOnStop, setForceSaveOnStop] = useState(instance.forceSaveOnStop !== false);
  const [autostart, setAutostart] = useState(instance.autostart || false);
  const [autoRestart, setAutoRestart] = useState(instance.autoRestart || false);
  const [scheduledRestartHours, setScheduledRestartHours] = useState(String(instance.scheduledRestartHours ?? 0));
  const [backupsKept, setBackupsKept] = useState(String(instance.backupsKept ?? 5));
  const [javaPath, setJavaPath] = useState(instance.javaPath || '');
  const [jvmArgsString, setJvmArgsString] = useState(instance.jvmArgs?.join(' ') || '');

  // Icon preview and upload state
  const [iconPreview, setIconPreview] = useState<string | null>(
    instance.hasIcon ? getInstanceIconUrl(instance.id) : null
  );
  const [pendingIconBase64, setPendingIconBase64] = useState<string | null>(null);
  const [removeIconPending, setRemoveIconPending] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);

  // Bridge installation state
  const [isInstallingBridge, setIsInstallingBridge] = useState(false);
  const [bridgeFeedback, setBridgeFeedback] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const bridgeInstalled = Boolean(instance.bridgeInstalled);

  const handleInstallBridge = async () => {
    setIsInstallingBridge(true);
    setBridgeFeedback(null);
    setBridgeError(null);
    try {
      const result = await installInstanceBridge(instance.id);
      setBridgeFeedback(
        result.serverRunning ? t('edit_server.bridge_installed_restart') : t('edit_server.bridge_installed_ready')
      );
      await onRefreshInstances();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      setBridgeError(code ? t(`errors.${code}`, { defaultValue: message }) : message);
    } finally {
      setIsInstallingBridge(false);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(instance.dir);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const handleIconSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIconError(null);
    resizeToServerIcon(file, iconSizeFor(game))
      .then((base64) => {
        setPendingIconBase64(base64);
        setIconPreview(base64);
        setRemoveIconPending(false);
      })
      .catch((error: unknown) => setIconError(error instanceof Error ? error.message : String(error)));
  };

  const handleRemoveIcon = () => {
    setIconPreview(null);
    setPendingIconBase64(null);
    setRemoveIconPending(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const applyFlagPreset = (flags: string[]) => {
    const existing = jvmArgsString
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    // A preset that picks a garbage collector replaces any collector already present.
    const picksCollector = flags.some((flag) => /^-XX:\+Use\w+GC$/.test(flag));
    const kept = picksCollector ? existing.filter((flag) => !/^-XX:\+Use\w+GC$/.test(flag)) : existing;
    setJvmArgsString(Array.from(new Set([...kept, ...flags])).join(' '));
  };

  const calculatedMaxRamMb = ramUnit === 'GB' ? ramValue * 1024 : ramValue;
  const calculatedMinRamMb = Math.min(1024, calculatedMaxRamMb);

  const parsedJvmArgs = jvmArgsString
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const launchFile = instance.launchFile || game?.executableName || '';
  const startupPreview = [
    'java',
    `-Xms${calculatedMinRamMb}M`,
    `-Xmx${calculatedMaxRamMb}M`,
    ...parsedJvmArgs,
    '-jar',
    launchFile,
    ...(game?.launchArgs ?? [])
  ]
    .filter(Boolean)
    .join(' ');

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
        port: Number(port) || instance.port,
        maxPlayers: Number(maxPlayers) || instance.maxPlayers,
        minRamMb: calculatedMinRamMb,
        maxRamMb: calculatedMaxRamMb,
        forceSaveOnStop,
        autostart,
        autoRestart,
        scheduledRestartHours: Math.max(0, Math.floor(Number(scheduledRestartHours) || 0)),
        backupsKept: Math.max(1, Math.floor(Number(backupsKept) || 5)),
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
      <div className="geist-card bg-surface border border-hairline max-w-2xl w-full p-6 shadow-2xl space-y-5 h-[min(40rem,90vh)] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-ink tracking-[-0.3px]">
              {t('edit_server.modal_title')}
            </h2>
            <p className="text-[13px] text-mute mt-0.5">
              {t('edit_server.modal_subtitle', { name: instance.name })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-[4px] hover:bg-surface-2 text-mute hover:text-ink transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-4 border-b border-hairline pb-2 text-[13px] font-medium shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`pb-1.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'border-ink text-ink'
                : 'border-transparent text-mute hover:text-ink'
            }`}
          >
            <Server className="w-4 h-4" />
            {t('edit_server.tab_general')}
          </button>

          {usesJava && (
            <button
              type="button"
              onClick={() => setActiveTab('advanced')}
              className={`pb-1.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'advanced'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-mute hover:text-ink'
              }`}
            >
              <Layers className="w-4 h-4" />
              {t('edit_server.tab_advanced')}
            </button>
          )}

          {hasBridge && (
            <button
              type="button"
              onClick={() => setActiveTab('bridge')}
              className={`pb-1.5 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'bridge'
                  ? 'border-ink text-ink'
                  : 'border-transparent text-mute hover:text-ink'
              }`}
            >
              <Activity className="w-4 h-4" />
              {t('edit_server.tab_bridge')}
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activeTab === 'general' && (
            <div className="grid grid-cols-12 gap-5">
              {/* Left Column (7 cols) */}
              <div className="col-span-7 space-y-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.name_label')}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline text-[13px] text-ink focus:outline-none focus:border-ink"
                  />
                </div>

                {hasMotd && (
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.motd_label')}
                    </label>
                    <input
                      type="text"
                      value={motd}
                      onChange={(e) => setMotd(e.target.value)}
                      placeholder={t('create_server.motd_placeholder')}
                      className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline text-[13px] text-ink placeholder-mute focus:outline-none focus:border-ink"
                    />
                  </div>
                )}

                {/* Folder Path Display */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.folder_path')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={instance.dir}
                      readOnly
                      className="flex-1 h-8 px-2.5 rounded-[4px] bg-surface-2 border border-hairline font-mono text-[11px] text-soft select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="h-8 px-2 rounded-[4px] bg-surface border border-hairline hover:bg-surface-2 text-body flex items-center justify-center transition cursor-pointer"
                      title={t('edit_server.copy_path')}
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-success-fg" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="pt-2 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={forceSaveOnStop}
                      onChange={(e) => setForceSaveOnStop(e.target.checked)}
                      className="w-4 h-4 rounded border-hairline accent-ink focus:ring-0 cursor-pointer"
                    />
                    <span>{t('edit_server.force_save_label')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={autostart}
                      onChange={(e) => setAutostart(e.target.checked)}
                      className="w-4 h-4 rounded border-hairline accent-ink focus:ring-0 cursor-pointer"
                    />
                    <span>{t('edit_server.autostart_label')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] text-ink">
                    <input
                      type="checkbox"
                      checked={autoRestart}
                      onChange={(e) => setAutoRestart(e.target.checked)}
                      className="w-4 h-4 rounded border-hairline accent-ink focus:ring-0 cursor-pointer"
                    />
                    <span>{t('edit_server.auto_restart_label')}</span>
                  </label>

                  <label className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="number"
                      min={0}
                      value={scheduledRestartHours}
                      onChange={(e) => setScheduledRestartHours(e.target.value)}
                      className="w-16 rounded-[6px] border border-hairline bg-surface px-2 py-1 text-[13px]"
                    />
                    <span>{t('edit_server.scheduled_restart_label')}</span>
                  </label>

                  <label className="flex items-center gap-2 text-[13px] text-ink">
                    <input
                      type="number"
                      min={1}
                      value={backupsKept}
                      onChange={(e) => setBackupsKept(e.target.value)}
                      className="w-16 rounded-[6px] border border-hairline bg-surface px-2 py-1 text-[13px]"
                    />
                    <span>{t('edit_server.backups_kept_label')}</span>
                  </label>
                </div>
              </div>

              {/* Right Column (5 cols) */}
              <div className="col-span-5 space-y-4">
                {/* Server Icon Box */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.icon_label')}
                  </label>
                  <div className="p-3 rounded-[4px] border border-hairline bg-surface-2 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-[4px] border border-hairline-strong bg-surface flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt={t('edit_server.icon_alt')}
                          className="w-full h-full object-contain image-rendering-pixelated"
                        />
                      ) : (
                        <Server className="w-8 h-8 text-mute" />
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleIconSelected}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-7 px-2.5 rounded-[4px] bg-surface hover:bg-surface-3 border border-hairline text-[11px] font-medium text-ink flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-3 h-3 text-accent-fg" />
                        <span>{t('edit_server.upload_icon')}</span>
                      </button>

                      {iconPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveIcon}
                          className="h-6 px-2 rounded-[4px] text-[11px] font-medium text-danger-fg hover:bg-danger-soft/40 dark:hover:bg-danger-soft/50 flex items-center gap-1 transition cursor-pointer self-start"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t('edit_server.remove_icon')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {iconError && <p className="text-[11px] text-danger-fg">{iconError}</p>}
                  <ServerIconHint game={game} />
                </div>

                {/* RAM Allocation */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
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
                      className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline font-mono text-[13px] text-ink focus:outline-none focus:border-ink"
                    />
                    <Select
                      className="w-[88px] shrink-0 font-mono"
                      ariaLabel={t('edit_server.ram_label')}
                      value={ramUnit}
                      onValueChange={(value) => {
                        const nextUnit = value as 'GB' | 'MB';
                        if (nextUnit === 'MB' && ramUnit === 'GB') {
                          setRamValue(ramValue * 1024);
                        } else if (nextUnit === 'GB' && ramUnit === 'MB') {
                          setRamValue(Math.max(1, Math.round(ramValue / 1024)));
                        }
                        setRamUnit(nextUnit);
                      }}
                      options={[
                        { value: 'GB', label: 'GB' },
                        { value: 'MB', label: 'MB' }
                      ]}
                    />
                  </div>
                </div>

                {/* Server Port & Max Players */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.port_label')}
                    </label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-[4px] bg-surface border border-hairline font-mono text-[13px] text-ink focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.max_players_label')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-[4px] bg-surface border border-hairline font-mono text-[13px] text-ink focus:outline-none focus:border-ink"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && usesJava && (
            <div className="space-y-4">
              {/* Java Path Override */}
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-mute">
                  {t('edit_server.java_path_label')}
                </label>
                <input
                  type="text"
                  value={javaPath}
                  onChange={(e) => setJavaPath(e.target.value)}
                  placeholder="C:\Program Files\Java\jdk-21\bin\java.exe"
                  className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline font-mono text-[12px] text-ink placeholder-mute focus:outline-none focus:border-ink"
                />
                <p className="text-[11px] text-mute">
                  {t('edit_server.java_path_hint')}
                </p>
              </div>

              {/* Startup Line / JVM Flags */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.jvm_args_label')}
                  </label>
                </div>
                {jvmFlagPresets.length > 0 && (
                  <div className="space-y-1.5 pb-1">
                    <p className="text-[11px] text-mute">{t('edit_server.presets_hint')}</p>
                    {jvmFlagPresets.map((preset) => {
                      const recommended = Boolean(instance.loader && preset.recommendedFor?.includes(instance.loader));
                      return (
                        <div
                          key={preset.id}
                          className="flex items-start justify-between gap-3 rounded-[6px] border border-hairline bg-surface-2 p-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                              {t(`edit_server.preset.${preset.id}.label`, { defaultValue: preset.label })}
                              {recommended && (
                                <span className="rounded-[4px] bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success-fg">
                                  {t('edit_server.preset_recommended')}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] leading-relaxed text-soft">
                              {t(`edit_server.preset.${preset.id}.desc`, { defaultValue: preset.description })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyFlagPreset(preset.flags)}
                            className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-accent-fg hover:underline"
                          >
                            <Sparkles className="h-3 w-3" />
                            {t('edit_server.preset_apply')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <textarea
                  value={jvmArgsString}
                  onChange={(e) => setJvmArgsString(e.target.value)}
                  placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
                  rows={3}
                  className="w-full p-2.5 rounded-[4px] bg-surface border border-hairline font-mono text-[12px] text-ink placeholder-mute focus:outline-none focus:border-ink"
                />
              </div>

              {/* Startup Line Preview */}
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-mute">
                  {t('edit_server.startup_preview_label')}
                </label>
                <div className="p-3 rounded-[4px] bg-ink border border-transparent dark:border-hairline text-on-ink font-mono text-[11px] break-all leading-relaxed">
                  {startupPreview}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bridge' && hasBridge && (
            <div className="space-y-4">
              <div className="p-4 rounded-[6px] border border-hairline bg-surface-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-accent-fg" />
                    <h3 className="text-[14px] font-semibold text-ink">
                      {t('edit_server.bridge_title')}
                    </h3>
                  </div>
                  {instance.bridgeConnected ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-success/10 dark:bg-success/15 border border-success/30 text-success-fg font-mono text-[11px] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      {t('edit_server.bridge_status_active')}
                    </span>
                  ) : bridgeInstalled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-warning/10 dark:bg-warning/15 border border-warning/30 text-warning font-mono text-[11px] font-medium">
                      {t('edit_server.bridge_status_ready')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-hairline text-mute font-mono text-[11px] font-medium">
                      {t('edit_server.bridge_status_missing')}
                    </span>
                  )}
                </div>

                <p className="text-[12px] leading-relaxed text-soft">
                  {t('edit_server.bridge_description')}
                </p>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] font-mono text-mute">
                    {t('edit_server.engine_label')}: <span className="font-semibold text-ink uppercase">{instance.loader || 'vanilla'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleInstallBridge}
                    disabled={isInstallingBridge || instance.bridgeSupported === false}
                    className="h-8 px-3.5 rounded-[4px] bg-ink hover:bg-ink-hover text-on-ink disabled:opacity-40 text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    {isInstallingBridge ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('edit_server.bridge_installing')}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-success-fg" />
                        <span>{t('edit_server.bridge_install_button')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {instance.bridgeSupported === false && (
                <div className="p-3 rounded-[4px] bg-warning-soft border border-warning-soft text-warning-fg text-[12px]">
                  {t('edit_server.bridge_unsupported')}
                </div>
              )}

              {bridgeError && (
                <div className="p-3 rounded-[4px] bg-danger-soft border border-danger-soft text-danger-fg text-[12px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{bridgeError}</span>
                </div>
              )}

              {bridgeFeedback && (
                <div className="p-3 rounded-[4px] bg-success/10 dark:bg-success/15 border border-success/30 text-success-fg text-[12px] flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-success-fg" />
                  <span>{bridgeFeedback}</span>
                </div>
              )}
            </div>
          )}

          {/* Warning banner when server is online */}
          {serverStatus !== 'OFFLINE' && (
            <div className="p-2.5 rounded-[4px] bg-warning-soft border border-warning-soft flex items-center gap-2 text-[12px] text-warning-fg">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('edit_server.running_warning')}</span>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-9 px-4 rounded-[4px] bg-surface hover:bg-surface-2 border border-hairline text-[13px] font-medium text-body transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-9 px-5 rounded-[4px] bg-ink hover:bg-ink-hover text-on-ink disabled:opacity-40 text-[13px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
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
  onRefreshInstances,
  jvmFlagPresets,
  game
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
      jvmFlagPresets={jvmFlagPresets ?? []}
      game={game}
    />
  );
};
