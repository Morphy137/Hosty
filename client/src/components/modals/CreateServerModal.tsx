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
  ChevronRight,
  ChevronLeft,
  Check,
  Server,
  Layers,
  Settings2,
  Gamepad2,
  AlertCircle
} from 'lucide-react';
import type { ServerLoader, InstanceSettings, JarInspection, ProvisionJobState } from '../../types/daemon';
import { SERVER_LOADERS, LOADER_METADATA } from '../../types/daemon';
import { fetchLoaderVersions, fetchSystemEnvironment, inspectServerJar } from '../../api/daemonApi';
import { defaultMinRamMb, maxAllocatableRamMb, recommendedRamMb } from '../../utils/ram';
import { GameLogo } from '../common/GameIcons';
import { Select } from '../ui/Select';

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
    loader?: ServerLoader;
    loaderVersion?: string;
  }) => Promise<void>;
  provisionLogs: string[];
  provisionJob: ProvisionJobState | null;
  onCancelInstall: () => void;
}

interface SupportedGameOption {
  id: string;
  name: string;
  category: string;
  defaultPort: number;
  defaultPlayers: number;
  descKey: string;
}

const SUPPORTED_GAMES: SupportedGameOption[] = [
  {
    id: 'minecraft',
    name: 'Minecraft',
    category: 'Voxel Sandbox',
    defaultPort: 25565,
    defaultPlayers: 20,
    descKey: 'create_server.game_minecraft_desc'
  },
  {
    id: 'project-zomboid',
    name: 'Project Zomboid',
    category: 'Survival RPG',
    defaultPort: 16261,
    defaultPlayers: 32,
    descKey: 'create_server.game_zomboid_desc'
  },
  {
    id: 'hytale',
    name: 'Hytale',
    category: 'Voxel RPG',
    defaultPort: 25565,
    defaultPlayers: 40,
    descKey: 'create_server.game_hytale_desc'
  }
];

type WizardStep = 'game' | 'installation' | 'settings' | 'review';

const WIZARD_STEPS: { id: WizardStep; labelKey: string; icon: React.ElementType }[] = [
  { id: 'game', labelKey: 'create_server.steps.game', icon: Gamepad2 },
  { id: 'installation', labelKey: 'create_server.steps.installation', icon: Layers },
  { id: 'settings', labelKey: 'create_server.steps.settings', icon: Settings2 },
  { id: 'review', labelKey: 'create_server.steps.review', icon: Server }
];

const FALLBACK_MINECRAFT_VERSIONS: readonly string[] = [
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.2',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.16.5'
];

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  onUploadJar,
  provisionLogs,
  provisionJob,
  onCancelInstall
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('game');
  const [selectedGame, setSelectedGame] = useState<string>('minecraft');
  const [serverName, setServerName] = useState('My Minecraft Server');
  const [instanceId, setInstanceId] = useState('survival-main');
  const [motd, setMotd] = useState('A Minecraft Server');
  const [port, setPort] = useState(25565);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [ramValue, setRamValue] = useState(4);
  const [ramUnit, setRamUnit] = useState<'GB' | 'MB'>('GB');

  const [selectedLoader, setSelectedLoader] = useState<ServerLoader>('fabric');
  const [versions, setVersions] = useState<string[]>([...FALLBACK_MINECRAFT_VERSIONS]);
  const [selectedVersion, setSelectedVersion] = useState<string>(FALLBACK_MINECRAFT_VERSIONS[0]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Manual Jar / Custom state
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [useCustomJar, setUseCustomJar] = useState(false);
  const [pzBranch, setPzBranch] = useState<'stable' | 'unstable'>('stable');
  const [isJavaMissing, setIsJavaMissing] = useState(false);
  const [detected, setDetected] = useState<JarInspection | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [systemRamMb, setSystemRamMb] = useState<number | undefined>(undefined);

  const currentLoaderMeta = LOADER_METADATA[selectedLoader];
  const requiresManualJar = selectedGame === 'minecraft' && !currentLoaderMeta.isAutomatic;

  const handleClose = () => {
    setStep('game');
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    fetchSystemEnvironment()
      .then((env) => {
        if (ignore) return;
        if (env?.java) setIsJavaMissing(!env.java.detected);
        if (env?.totalMemMb) {
          setSystemRamMb(env.totalMemMb);
          setRamValue(Math.round(recommendedRamMb(env.totalMemMb) / 1024));
          setRamUnit('GB');
        }
      })
      .catch(() => {
        // Fallback gracefully on network error or offline mock
      });
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || selectedGame !== 'minecraft') return;

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
        const validList = verList && verList.length > 0 ? verList : FALLBACK_MINECRAFT_VERSIONS;
        setVersions([...validList]);
        setSelectedVersion((prev) => (validList.includes(prev) ? prev : validList[0] ?? ''));
      })
      .catch(() => {
        if (ignore) return;
        setVersions([...FALLBACK_MINECRAFT_VERSIONS]);
        setSelectedVersion((prev) =>
          FALLBACK_MINECRAFT_VERSIONS.includes(prev) ? prev : FALLBACK_MINECRAFT_VERSIONS[0] ?? ''
        );
      })
      .finally(() => {
        if (!ignore) setIsLoadingVersions(false);
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, selectedGame, selectedLoader, currentLoaderMeta.isAutomatic]);

  if (!isOpen) return null;

  const handleGameChange = (gameId: string) => {
    setSelectedGame(gameId);
    const game = SUPPORTED_GAMES.find((g) => g.id === gameId);
    if (!game) return;

    setPort(game.defaultPort);
    setMaxPlayers(game.defaultPlayers);

    if (gameId === 'project-zomboid') {
      setServerName('Project Zomboid Server');
      setInstanceId('zomboid-main');
      setMotd('Project Zomboid Dedicated Server');
    } else if (gameId === 'hytale') {
      setServerName('Hytale Adventure Server');
      setInstanceId('hytale-main');
      setMotd('Hytale Community Server');
    } else {
      setServerName('My Minecraft Server');
      setInstanceId('survival-main');
      setMotd('A Minecraft Server');
    }
  };

  const attachJar = (file: File | undefined) => {
    if (!file || !file.name.toLowerCase().endsWith('.jar')) return;
    setAttachedFile(file);
    setDetected(null);
    setIsInspecting(true);
    inspectServerJar(file)
      .then((inspection) => {
        setDetected(inspection);
        if (inspection.loader) setSelectedLoader(inspection.loader);
      })
      .catch(() => {
        // Detection is advisory; the user can still pick the loader manually.
      })
      .finally(() => setIsInspecting(false));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    attachJar(e.target.files?.[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    attachJar(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInstalling) return;

    const safeId = instanceId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const safeName = serverName.trim();

    const calculatedMaxRamMb = ramUnit === 'GB' ? ramValue * 1024 : ramValue;
    const calculatedMinRamMb = defaultMinRamMb(calculatedMaxRamMb);
    const settings: Partial<InstanceSettings> = {
      motd: motd.trim(),
      port: Number(port) || (selectedGame === 'project-zomboid' ? 16261 : 25565),
      maxPlayers: Number(maxPlayers) || (selectedGame === 'project-zomboid' ? 32 : 20),
      minRamMb: calculatedMinRamMb,
      maxRamMb: calculatedMaxRamMb,
      gameId: selectedGame,
      ...(selectedGame === 'project-zomboid' ? { pzBranch } : {})
    };

    setIsInstalling(true);
    try {
      if (selectedGame === 'minecraft') {
        if (requiresManualJar || (useCustomJar && attachedFile)) {
          if (!attachedFile) return;
          await onUploadJar({
            file: attachedFile,
            instanceId: safeId,
            instanceName: safeName,
            settings,
            loader: selectedLoader,
            loaderVersion: detected?.mcVersion ?? undefined
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
      } else {
        if (attachedFile) {
          await onUploadJar({
            file: attachedFile,
            instanceId: safeId,
            instanceName: safeName,
            settings
          });
        } else {
          await onInstall({
            loader: 'vanilla',
            version: 'custom',
            instanceId: safeId,
            instanceName: safeName,
            settings
          });
        }
      }
      setIsInstalling(false);
      handleClose();
    } catch {
      setIsInstalling(false);
    }
  };

  const isInstallationValid =
    selectedGame !== 'minecraft' ||
    (!requiresManualJar && !useCustomJar && Boolean(selectedVersion)) ||
    ((requiresManualJar || useCustomJar) && Boolean(attachedFile));

  const ramLimitMb = maxAllocatableRamMb(systemRamMb);
  const requestedRamMb = ramUnit === 'GB' ? ramValue * 1024 : ramValue;
  const isSettingsValid = Boolean(
    serverName.trim() && instanceId.trim() && port > 0 && maxPlayers > 0 && ramValue > 0 && requestedRamMb <= ramLimitMb
  );

  const getStepIndex = (s: WizardStep) => WIZARD_STEPS.findIndex((item) => item.id === s);
  const currentStepIndex = getStepIndex(step);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-surface border border-hairline max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-semibold text-ink tracking-[-0.3px]">
              {t('create_server.modal_title')}
            </h2>
            <p className="text-[13px] text-mute mt-0.5">
              {t(`create_server.step_desc.${step}`)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isInstalling}
            className="p-1.5 rounded-[4px] hover:bg-surface-2 text-mute hover:text-ink transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="grid grid-cols-4 gap-2 shrink-0 border-b border-hairline pb-3">
          {WIZARD_STEPS.map((s, idx) => {
            const isCurrent = step === s.id;
            const isPast = idx < currentStepIndex;
            const StepIcon = s.icon;

            return (
              <button
                key={s.id}
                type="button"
                disabled={isInstalling || (!isPast && !isCurrent)}
                onClick={() => isPast && setStep(s.id)}
                className={`flex items-center gap-2 py-1.5 px-2 rounded-[4px] text-left transition ${
                  isCurrent
                    ? 'bg-ink/5 dark:bg-ink-hover/10 text-accent-fg font-medium'
                    : isPast
                    ? 'text-ink hover:bg-surface-2 cursor-pointer'
                    : 'text-mute opacity-60 cursor-default'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-mono ${
                    isPast
                      ? 'bg-accent text-white'
                      : isCurrent
                      ? 'bg-accent/15 text-accent-fg border border-accent'
                      : 'border border-hairline text-mute'
                  }`}
                >
                  {isPast ? <Check className="w-3 h-3 stroke-[3]" /> : <StepIcon className="w-3 h-3" />}
                </div>
                <span className="text-[12px] truncate">{t(s.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body - Step by Step */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* STEP 1: GAME SELECTION */}
          {step === 'game' && (
            <div className="space-y-4">
              <label className="font-mono text-[11px] uppercase text-mute">
                {t('create_server.game_engine_label')}
              </label>

              <div className="grid grid-cols-1 gap-3">
                {SUPPORTED_GAMES.map((game) => {
                  const isSelected = selectedGame === game.id;
                  return (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => handleGameChange(game.id)}
                      disabled={isInstalling}
                      className={`p-4 rounded-[8px] border text-left transition cursor-pointer flex items-center justify-between gap-4 ${
                        isSelected
                          ? 'border-accent bg-accent/5 dark:bg-accent/10 text-ink'
                          : 'border-hairline bg-surface hover:border-mute/60 text-ink'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <GameLogo gameId={game.id} size={36} />
                        <div className="min-w-0">
                          <div>
                            <span className="text-[14px] font-semibold text-ink">
                              {game.name}
                            </span>
                          </div>
                          <p className="text-[12px] text-soft mt-0.5 truncate">
                            {t(game.descKey)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                            isSelected
                              ? 'border-accent bg-accent text-white'
                              : 'border-hairline-strong'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: INSTALLATION & ENGINE SETUP */}
          {step === 'installation' && (
            <div className="space-y-4">
              {/* MINECRAFT SETUP */}
              {selectedGame === 'minecraft' && (
                <>
                  {isJavaMissing && (
                    <div className="p-3.5 rounded-[6px] bg-warning-soft border border-warning-soft dark:border-warning/30 flex items-start gap-3 text-[12px]">
                      <AlertCircle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="font-semibold text-ink">
                          {t('environment.java_missing_title')}
                        </div>
                        <p className="text-[12px] leading-relaxed text-soft">
                          {t('environment.java_missing_desc')}
                        </p>
                        <div className="pt-0.5">
                          <a
                            href="https://adoptium.net/temurin/releases/?version=21"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-[4px] bg-warning text-black hover:bg-warning transition no-underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {t('environment.java_download_btn')}
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('create_server.install_method_label')}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUseCustomJar(false)}
                        className={`px-2.5 py-1 rounded-[4px] text-[12px] font-medium transition cursor-pointer ${
                          !useCustomJar
                            ? 'bg-ink text-on-ink'
                            : 'text-mute hover:text-ink'
                        }`}
                      >
                        {t('create_server.install_auto')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseCustomJar(true)}
                        className={`px-2.5 py-1 rounded-[4px] text-[12px] font-medium transition cursor-pointer ${
                          useCustomJar
                            ? 'bg-ink text-on-ink'
                            : 'text-mute hover:text-ink'
                        }`}
                      >
                        {t('create_server.install_custom')}
                      </button>
                    </div>
                  </div>

                  {/* LOADER GRID (always visible) + automated version selector */}
                  <div className="space-y-3.5">
                      <div className="space-y-1.5">
                        <label className="font-mono text-[11px] uppercase text-mute">
                          {t('provisioning.loader_label')}
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {SERVER_LOADERS.map((loader) => {
                            const meta = LOADER_METADATA[loader];
                            const isSelected = selectedLoader === loader;

                            return (
                              <button
                                key={loader}
                                type="button"
                                onClick={() => setSelectedLoader(loader)}
                                disabled={isInstalling}
                                className={`p-2.5 rounded-[4px] border text-left transition cursor-pointer flex flex-col justify-between ${
                                  isSelected
                                    ? 'border-accent bg-accent/5 dark:bg-accent/10 text-accent-fg'
                                    : 'bg-surface text-ink border-hairline hover:bg-surface-2'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[12px] font-semibold uppercase">
                                    {meta.name}
                                  </span>
                                  <span
                                    className={`font-mono text-[9px] uppercase px-1 py-0.5 rounded-[2px] ${
                                      isSelected
                                        ? 'bg-accent/15 dark:bg-accent/20 text-accent-fg'
                                        : meta.isAutomatic
                                        ? 'bg-success/15 text-accent-fg'
                                        : 'bg-surface-2 border border-hairline text-mute'
                                    }`}
                                  >
                                    {meta.isAutomatic ? t('create_server.badge_auto') : t('create_server.badge_manual')}
                                  </span>
                                </div>
                                <span
                                  className={`text-[10px] mt-1 capitalize ${
                                    isSelected
                                      ? 'text-accent-fg/80'
                                      : 'text-mute'
                                  }`}
                                >
                                  {meta.category}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Version Selector */}
                      {!requiresManualJar && !useCustomJar && (
                        <div className="space-y-1.5">
                          <label className="font-mono text-[11px] uppercase text-mute flex items-center justify-between">
                            <span>{t('provisioning.version_label')}</span>
                            {isLoadingVersions && (
                              <span className="flex items-center gap-1 text-[11px] text-accent-fg">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t('provisioning.loading_versions')}
                              </span>
                            )}
                          </label>

                          <Select
                            className="font-mono"
                            ariaLabel={t('provisioning.version_label')}
                            value={selectedVersion}
                            onValueChange={setSelectedVersion}
                            disabled={isInstalling || versions.length === 0}
                            options={versions.map((v) => ({
                              value: v,
                              label: t('create_server.version_option', { version: v, loader: selectedLoader.toUpperCase() })
                            }))}
                          />
                        </div>
                      )}
                  </div>

                  {/* CUSTOM / MANUAL JAR DROPZONE */}
                  {(requiresManualJar || useCustomJar) && (
                    <div className="space-y-3 p-3.5 rounded-[6px] bg-surface-2 border border-hairline">
                      {currentLoaderMeta.officialUrl && (
                        <div className="flex items-start justify-between gap-3 text-[12px] text-body">
                          <p>
                            {t('provisioning.manual_download_instructions', {
                              loader: currentLoaderMeta.name
                            })}
                          </p>
                          <a
                            href={currentLoaderMeta.officialUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 px-2.5 py-1 rounded-[4px] bg-surface border border-hairline hover:border-ink text-[11px] font-medium text-ink flex items-center gap-1 transition"
                          >
                            <span>{t('provisioning.visit_official_site')}</span>
                            <ExternalLink className="w-3 h-3 text-mute" />
                          </a>
                        </div>
                      )}

                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-hairline-strong hover:border-ink rounded-[6px] p-5 text-center cursor-pointer transition bg-surface"
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".jar"
                          onChange={handleFileChange}
                          className="hidden"
                        />

                        {attachedFile ? (
                          <div className="flex items-center justify-center gap-2.5">
                            <FileText className="w-6 h-6 text-accent-fg" />
                            <div className="text-left">
                              <div className="font-mono text-[13px] font-medium text-ink">
                                {attachedFile.name}
                              </div>
                              <div className="font-mono text-[11px] text-mute">
                                {(attachedFile.size / (1024 * 1024)).toFixed(2)} MB
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Upload className="w-6 h-6 text-mute mx-auto" />
                            <div className="text-[13px] font-medium text-ink">
                              {t('provisioning.upload_jar_dropzone')}
                            </div>
                            <div className="text-[11px] text-mute">
                              {t('provisioning.upload_jar_hint')}
                            </div>
                          </div>
                        )}
                      </div>

                      {attachedFile && (
                        <div className="flex items-center gap-2 text-[12px] text-body">
                          {isInspecting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {t('create_server.detecting_jar')}
                            </>
                          ) : detected?.loader ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-success-fg" />
                              {t(
                                detected.kind === 'installer'
                                  ? 'create_server.detected_installer'
                                  : 'create_server.detected_server',
                                {
                                  loader: LOADER_METADATA[detected.loader].name,
                                  version: detected.mcVersion ?? '?'
                                }
                              )}
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-warning" />
                              {t('create_server.detected_unknown')}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* PROJECT ZOMBOID SETUP */}
              {selectedGame === 'project-zomboid' && (
                <div className="space-y-3.5">
                  <div className="p-4 rounded-[6px] bg-surface-2 border border-hairline space-y-2">
                    <div className="flex items-center gap-2">
                      <GameLogo gameId="project-zomboid" size={24} />
                      <span className="text-[13px] font-semibold text-ink">
                        {t('create_server.zomboid_info_title')}
                      </span>
                    </div>
                    <p className="text-[12px] text-soft leading-relaxed">
                      {t('create_server.zomboid_info_desc')}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-mono text-[11px] uppercase text-mute">
                      {t('create_server.zomboid_branch_label')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPzBranch('stable')}
                        className={`p-2.5 rounded-[4px] border text-left transition cursor-pointer ${
                          pzBranch === 'stable'
                            ? 'border-accent bg-accent/5 dark:bg-accent/10 text-accent-fg'
                            : 'border-hairline bg-surface text-ink'
                        }`}
                      >
                        <div className="text-[12px] font-medium">{t('create_server.zomboid_branch_stable')}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPzBranch('unstable')}
                        className={`p-2.5 rounded-[4px] border text-left transition cursor-pointer ${
                          pzBranch === 'unstable'
                            ? 'border-accent bg-accent/5 dark:bg-accent/10 text-accent-fg'
                            : 'border-hairline bg-surface text-ink'
                        }`}
                      >
                        <div className="text-[12px] font-medium">{t('create_server.zomboid_branch_unstable')}</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* HYTALE SETUP */}
              {selectedGame === 'hytale' && (
                <div className="p-4 rounded-[6px] bg-surface-2 border border-hairline space-y-2.5">
                  <div className="flex items-center gap-2">
                    <GameLogo gameId="hytale" size={24} />
                    <span className="text-[13px] font-semibold text-ink">
                      {t('create_server.hytale_info_title')}
                    </span>
                  </div>
                  <p className="text-[12px] text-soft leading-relaxed">
                    {t('create_server.hytale_info_desc')}
                  </p>
                  <div className="pt-2 border-t border-hairline text-[11px] text-mute">
                    {t('create_server.hytale_mode_notice')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SERVER SPECIFICATIONS & RESOURCES */}
          {step === 'settings' && (
            <div className="space-y-4">
              {/* Server Name & ID */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
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
                    className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline text-[13px] text-ink focus:outline-none focus:border-ink"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('create_server.id_label')}
                  </label>
                  <input
                    type="text"
                    value={instanceId}
                    onChange={(e) => setInstanceId(e.target.value)}
                    disabled={isInstalling}
                    required
                    className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline font-mono text-[12px] text-body focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              {/* MOTD */}
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-mute">
                  {t('edit_server.motd_label')}
                </label>
                <input
                  type="text"
                  value={motd}
                  onChange={(e) => setMotd(e.target.value)}
                  disabled={isInstalling}
                  placeholder={t('create_server.motd_placeholder')}
                  className="w-full h-9 px-3 rounded-[4px] bg-surface border border-hairline text-[13px] text-ink placeholder-mute focus:outline-none focus:border-ink"
                />
              </div>

              {/* Port, Max Players, RAM Allocation */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.port_label')}
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    disabled={isInstalling}
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
                    disabled={isInstalling}
                    className="w-full h-9 px-2.5 rounded-[4px] bg-surface border border-hairline font-mono text-[13px] text-ink focus:outline-none focus:border-ink"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-mono text-[11px] uppercase text-mute">
                    {t('edit_server.ram_label')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={ramUnit === 'GB' ? Math.max(1, Math.floor(ramLimitMb / 1024)) : ramLimitMb}
                      value={ramValue}
                      onChange={(e) => setRamValue(Math.max(1, Number(e.target.value)))}
                      disabled={isInstalling}
                      className="w-full h-9 px-2.5 rounded-[4px] bg-surface border border-hairline font-mono text-[13px] text-ink focus:outline-none focus:border-ink"
                    />
                    <Select
                      className="w-[88px] shrink-0 font-mono"
                      ariaLabel={t('edit_server.ram_label')}
                      value={ramUnit}
                      onValueChange={(value) => setRamUnit(value as 'GB' | 'MB')}
                      disabled={isInstalling}
                      options={[
                        { value: 'GB', label: 'GB' },
                        { value: 'MB', label: 'MB' }
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & DEPLOY */}
          {step === 'review' && (
            <div className="space-y-4">
              <label className="font-mono text-[11px] uppercase text-mute">
                {t('create_server.summary_title')}
              </label>

              {/* Summary Overview Card */}
              <div className="p-4 rounded-[6px] bg-surface-2 border border-hairline space-y-3">
                <div className="flex items-center gap-3 pb-3 border-b border-hairline">
                  <GameLogo gameId={selectedGame} size={32} />
                  <div>
                    <div className="text-[14px] font-semibold text-ink">
                      {serverName}
                    </div>
                    <div className="font-mono text-[11px] text-mute">
                      {instanceId}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span className="text-mute block text-[11px] font-mono uppercase">
                      {t('create_server.summary_game')}
                    </span>
                    <span className="font-medium text-ink">
                      {SUPPORTED_GAMES.find((g) => g.id === selectedGame)?.name}
                    </span>
                  </div>

                  <div>
                    <span className="text-mute block text-[11px] font-mono uppercase">
                      {t('create_server.summary_engine')}
                    </span>
                    <span className="font-medium text-ink">
                      {selectedGame === 'minecraft'
                        ? requiresManualJar || useCustomJar
                          ? attachedFile ? attachedFile.name : t('create_server.engine_custom_jar')
                          : `${selectedLoader.toUpperCase()} (${selectedVersion})`
                        : selectedGame === 'project-zomboid'
                        ? `SteamCMD (${pzBranch})`
                        : t('create_server.engine_native')}
                    </span>
                  </div>

                  <div>
                    <span className="text-mute block text-[11px] font-mono uppercase">
                      {t('create_server.summary_resources')}
                    </span>
                    <span className="font-mono font-medium text-ink">
                      {ramValue} {ramUnit}
                    </span>
                  </div>

                  <div>
                    <span className="text-mute block text-[11px] font-mono uppercase">
                      {t('create_server.summary_network')}
                    </span>
                    <span className="font-mono font-medium text-ink">
                      {t('create_server.network_summary', { port, max: maxPlayers })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Installation progress */}
              {isInstalling && provisionJob && provisionJob.status === 'running' && (
                <div className="p-3.5 rounded-[6px] bg-surface-2 border border-hairline space-y-2.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-ink">
                      {t(`provisioning.phase.${provisionJob.phase}`)}
                    </span>
                    {provisionJob.percent !== null && (
                      <span className="font-mono text-mute">{provisionJob.percent}%</span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-accent transition-all duration-200 ${
                        provisionJob.percent === null ? 'w-1/3 animate-pulse' : ''
                      }`}
                      style={provisionJob.percent !== null ? { width: `${provisionJob.percent}%` } : undefined}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onCancelInstall}
                      className="h-7 px-3 rounded-[4px] border border-hairline text-[12px] font-medium text-soft hover:text-danger-fg cursor-pointer transition"
                    >
                      {t('provisioning.cancel_install')}
                    </button>
                  </div>
                </div>
              )}

              {/* Provisioning Logs Feed */}
              {provisionLogs.length > 0 && (
                <div className="rounded-[4px] bg-console border border-white/10 text-white p-3 font-mono text-[11px] space-y-1 max-h-32 overflow-y-auto">
                  <div className="flex items-center justify-between text-white/50 pb-1 border-b border-white/10">
                    <span>{t('provisioning.logs_title')}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  </div>
                  {provisionLogs.map((log, i) => (
                    <div key={i} className="text-on-dark break-all">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-hairline shrink-0">
            {step === 'game' ? (
              <button
                type="button"
                onClick={handleClose}
                disabled={isInstalling}
                className="h-9 px-4 rounded-[4px] bg-surface-2 hover:bg-surface-3 border border-hairline text-soft text-[13px] font-medium transition cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (step === 'installation') setStep('game');
                  else if (step === 'settings') setStep('installation');
                  else if (step === 'review') setStep('settings');
                }}
                disabled={isInstalling}
                className="h-9 px-4 rounded-[4px] bg-surface-2 hover:bg-surface-3 border border-hairline text-soft text-[13px] font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('create_server.back_button')}
              </button>
            )}

            {step !== 'review' ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 'game') setStep('installation');
                  else if (step === 'installation' && isInstallationValid) setStep('settings');
                  else if (step === 'settings' && isSettingsValid) setStep('review');
                }}
                disabled={
                  (step === 'installation' && !isInstallationValid) ||
                  (step === 'settings' && !isSettingsValid)
                }
                className="h-9 px-5 rounded-[4px] bg-ink hover:bg-ink-hover text-on-ink disabled:opacity-40 text-[13px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                {t('create_server.continue_button')}
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isInstalling}
                className="h-9 px-5 rounded-[4px] bg-ink hover:bg-ink-hover text-on-ink disabled:opacity-40 text-[13px] font-medium flex items-center gap-2 transition cursor-pointer shadow-2xs"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('provisioning.installing')}
                  </>
                ) : selectedGame !== 'minecraft' ? (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    {t('create_server.create_instance_button')}
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
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
