import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, NumberInput } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { Tabs, type TabItem } from '../ui/Tabs';
import {
  X,
  Upload,
  Trash2,
  Server,
  Cpu,
  Wrench,
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
  installInstanceBridge,
  removeInstanceBridge
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

type TabKey = 'general' | 'resources' | 'maintenance' | 'bridge';

const MAX_SCHEDULED_RESTART_HOURS = 168;
const MAX_BACKUPS_KEPT = 100;

/** A titled group of settings rows (Maintenance tab). */
const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-1">
    <h3 className="font-mono text-[11px] uppercase text-mute">{title}</h3>
    <div className="divide-y divide-hairline rounded-[6px] border border-hairline bg-surface-2">{children}</div>
  </section>
);

/** One setting: label and explanation on the left, its control on the right. */
const SettingRow: React.FC<{ label: string; hint: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center justify-between gap-4 px-3.5 py-3">
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-ink">{label}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-mute">{hint}</p>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);


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
  const tabItems: TabItem<TabKey>[] = [
    { id: 'general', label: t('edit_server.tab_general'), icon: <Server className="h-4 w-4" /> },
    { id: 'resources', label: t('edit_server.tab_resources'), icon: <Cpu className="h-4 w-4" /> },
    { id: 'maintenance', label: t('edit_server.tab_maintenance'), icon: <Wrench className="h-4 w-4" /> },
    ...(hasBridge ? [{ id: 'bridge' as const, label: t('edit_server.tab_bridge'), icon: <Activity className="h-4 w-4" /> }] : [])
  ];

  const initialMaxMb = instance.maxRamMb || 4096;
  const isExactGb = initialMaxMb % 1024 === 0 && initialMaxMb >= 1024;
  const [ramValue, setRamValue] = useState(isExactGb ? initialMaxMb / 1024 : initialMaxMb);
  const [ramUnit, setRamUnit] = useState<'GB' | 'MB'>(isExactGb ? 'GB' : 'MB');

  const [forceSaveOnStop, setForceSaveOnStop] = useState(instance.forceSaveOnStop !== false);
  const [autostart, setAutostart] = useState(instance.autostart || false);
  const [autoRestart, setAutoRestart] = useState(instance.autoRestart || false);
  const [scheduledRestartHours, setScheduledRestartHours] = useState(instance.scheduledRestartHours ?? 0);
  const [backupsKept, setBackupsKept] = useState(instance.backupsKept ?? 5);
  const [javaPath, setJavaPath] = useState(instance.javaPath || '');
  const [jvmArgsString, setJvmArgsString] = useState(instance.jvmArgs?.join(' ') || '');

  // Icon preview and upload state
  const [iconPreview, setIconPreview] = useState<string | null>(
    instance.hasIcon ? getInstanceIconUrl(instance.id, instance.iconVersion) : null
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

  const handleRemoveBridge = async () => {
    setIsInstallingBridge(true);
    setBridgeFeedback(null);
    setBridgeError(null);
    try {
      await removeInstanceBridge(instance.id);
      setBridgeFeedback(t('edit_server.bridge_removed'));
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
        scheduledRestartHours: Math.max(0, Math.floor(scheduledRestartHours)),
        backupsKept: Math.max(1, Math.floor(backupsKept)),
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

        {/* Tab Navigation: same strip as the server header */}
        <Tabs
          className="-mt-2 shrink-0 border-b border-hairline"
          value={activeTab}
          onValueChange={setActiveTab}
          items={tabItems}
        />

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activeTab === 'general' && (
            <div className="grid grid-cols-12 gap-5">
              {/* Identity */}
              <div className="col-span-7 space-y-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.name_label')}
                  </label>
                  <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>

                {hasMotd && (
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.motd_label')}
                    </label>
                    <Input
                      type="text"
                      value={motd}
                      onChange={(e) => setMotd(e.target.value)}
                      placeholder={t('create_server.motd_placeholder')}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.port_label')}
                    </label>
                    <NumberInput value={port} onValueChange={setPort} min={1} max={65535} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.max_players_label')}
                    </label>
                    <NumberInput value={maxPlayers} onValueChange={setMaxPlayers} min={1} max={9999} className="font-mono" />
                  </div>
                </div>

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
                      className="flex-1 h-8 px-2.5 rounded-[6px] bg-surface-2 border border-hairline font-mono text-[11px] text-soft select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPath}
                      className="h-8 px-2 rounded-[6px] bg-surface border border-hairline hover:bg-surface-2 text-body flex items-center justify-center transition cursor-pointer"
                      title={t('edit_server.copy_path')}
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-success-fg" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Server Icon */}
              <div className="col-span-5 space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-mute">
                  {t('edit_server.icon_label')}
                </label>
                <div className="p-3 rounded-[6px] border border-hairline bg-surface-2 flex items-center gap-3">
                  <div className="w-16 h-16 rounded-[6px] border border-hairline-strong bg-surface flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                    {iconPreview ? (
                      <img
                        src={iconPreview}
                        alt={t('edit_server.icon_alt')}
                        className="w-full h-full object-contain [image-rendering:pixelated]"
                      />
                    ) : (
                      <Server className="w-8 h-8 text-mute" />
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleIconSelected} className="hidden" />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      leadingIcon={<Upload className="w-3 h-3" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('edit_server.upload_icon')}
                    </Button>
                    {iconPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveIcon}
                        className="h-6 px-2 rounded-[4px] text-[11px] font-medium text-danger-fg hover:bg-danger-soft flex items-center gap-1 transition cursor-pointer self-start"
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
            </div>
          )}

          {activeTab === 'resources' && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-mute">
                  {t('edit_server.ram_label')}
                </label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    value={ramValue}
                    onValueChange={setRamValue}
                    min={ramUnit === 'GB' ? 1 : 512}
                    max={ramUnit === 'GB' ? 64 : 65536}
                    step={ramUnit === 'GB' ? 1 : 256}
                    className="w-40 font-mono"
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
                <p className="text-[11px] text-mute">{t('edit_server.ram_hint')}</p>
              </div>

              {usesJava && (
                <>
                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.java_path_label')}
                    </label>
                    <Input
                      type="text"
                      value={javaPath}
                      onChange={(e) => setJavaPath(e.target.value)}
                      placeholder={t('edit_server.java_path_placeholder')}
                      className="font-mono text-[12px]"
                    />
                    <p className="text-[11px] text-mute">{t('edit_server.java_path_hint')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.jvm_args_label')}
                    </label>
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
                                  {recommended && <Badge variant="success">{t('edit_server.preset_recommended')}</Badge>}
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
                      className="w-full p-2.5 rounded-[6px] bg-surface border border-hairline font-mono text-[12px] text-ink placeholder-mute focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('edit_server.startup_preview_label')}
                    </label>
                    <div className="p-3 rounded-[6px] bg-ink border border-transparent dark:border-hairline text-on-ink font-mono text-[11px] break-all leading-relaxed">
                      {startupPreview}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="space-y-5">
              <SettingsSection title={t('edit_server.section_lifecycle')}>
                <SettingRow label={t('edit_server.autostart_label')} hint={t('edit_server.autostart_hint')}>
                  <Switch checked={autostart} onCheckedChange={setAutostart} ariaLabel={t('edit_server.autostart_label')} />
                </SettingRow>
                <SettingRow label={t('edit_server.force_save_label')} hint={t('edit_server.force_save_hint')}>
                  <Switch
                    checked={forceSaveOnStop}
                    onCheckedChange={setForceSaveOnStop}
                    ariaLabel={t('edit_server.force_save_label')}
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title={t('edit_server.section_restarts')}>
                <SettingRow label={t('edit_server.auto_restart_label')} hint={t('edit_server.auto_restart_hint')}>
                  <Switch checked={autoRestart} onCheckedChange={setAutoRestart} ariaLabel={t('edit_server.auto_restart_label')} />
                </SettingRow>
                <SettingRow label={t('edit_server.scheduled_restart_label')} hint={t('edit_server.scheduled_restart_hint')}>
                  <NumberInput
                    value={scheduledRestartHours}
                    onValueChange={setScheduledRestartHours}
                    min={0}
                    max={MAX_SCHEDULED_RESTART_HOURS}
                    aria-label={t('edit_server.scheduled_restart_label')}
                    className="w-20 font-mono"
                  />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title={t('edit_server.section_backups')}>
                <SettingRow label={t('edit_server.backups_kept_label')} hint={t('edit_server.backups_kept_hint')}>
                  <NumberInput
                    value={backupsKept}
                    onValueChange={setBackupsKept}
                    min={1}
                    max={MAX_BACKUPS_KEPT}
                    aria-label={t('edit_server.backups_kept_label')}
                    className="w-20 font-mono"
                  />
                </SettingRow>
              </SettingsSection>
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
                    <Badge variant="success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      {t('edit_server.bridge_status_active')}
                    </Badge>
                  ) : bridgeInstalled ? (
                    <Badge variant="warning">{t('edit_server.bridge_status_ready')}</Badge>
                  ) : (
                    <Badge>{t('edit_server.bridge_status_missing')}</Badge>
                  )}
                </div>

                <p className="text-[12px] leading-relaxed text-soft">
                  {t('edit_server.bridge_description')}
                </p>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] font-mono text-mute">
                    {t('edit_server.engine_label')}: <span className="font-semibold text-ink uppercase">{instance.loader || '—'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {bridgeInstalled && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleRemoveBridge}
                        disabled={isInstallingBridge || serverStatus !== 'OFFLINE'}
                        title={serverStatus !== 'OFFLINE' ? t('edit_server.bridge_remove_offline') : undefined}
                        leadingIcon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        {t('edit_server.bridge_remove_button')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={handleInstallBridge}
                      disabled={isInstallingBridge || instance.bridgeSupported === false}
                      leadingIcon={
                        isInstallingBridge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />
                      }
                    >
                      {isInstallingBridge
                        ? t('edit_server.bridge_installing')
                        : bridgeInstalled
                          ? t('edit_server.bridge_reinstall_button')
                          : t('edit_server.bridge_install_button')}
                    </Button>
                  </div>
                </div>
              </div>

              {instance.bridgeSupported === false && (
                <div className="p-3 rounded-[6px] bg-warning-soft border border-warning-soft text-warning-fg text-[12px]">
                  {t('edit_server.bridge_unsupported')}
                </div>
              )}

              {bridgeError && (
                <div className="p-3 rounded-[6px] bg-danger-soft border border-danger-soft text-danger-fg text-[12px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{bridgeError}</span>
                </div>
              )}

              {bridgeFeedback && (
                <div className="p-3 rounded-[6px] bg-success-soft border border-success-soft text-success-fg text-[12px] flex items-center gap-2">
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
