import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDaemonSocket } from './hooks/useDaemonSocket';
import { useDaemonHealth } from './hooks/useDaemonHealth';
import { useInstances } from './hooks/useInstances';
import { useModFiles } from './hooks/useModFiles';
import { useConfigFiles } from './hooks/useConfigFiles';
import { ConfigFilesTab } from './components/tabs/ConfigFilesTab';
import { GamePacksDialog } from './components/modals/GamePacksDialog';
import { useModConfigs } from './hooks/useModConfigs';
import {
  provisionInstance,
  openInstanceFolder,
  toErrorPayload,
  installServer,
  uploadServerFile,
  waitForProvisionJob,
  cancelProvisionJob,
  fetchConsoleBuffer
} from './api/daemonApi';
import type { DaemonErrorPayload, InstanceSettings, PlayerState, ServerStatus } from './types/daemon';
import { useTheme } from './hooks/useTheme';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { ServerHeader } from './components/layout/ServerHeader';
import { Skeleton } from './components/ui/Skeleton';
import { availableTabs, resolveActiveTab, type TabId } from './utils/tabs';
import { useGames } from './hooks/useGames';
import { useLocales } from './hooks/useLocales';
import { useAppVersion } from './hooks/useAppVersion';
import { useMetricsHistory } from './hooks/useMetricsHistory';
import { useToast } from './components/ui/toastContext';
import { isTauriRuntime } from './config/daemon';
import { ErrorAlert } from './components/common/ErrorAlert';
import { OverviewTab } from './components/tabs/OverviewTab';
import { PlayersTab } from './components/tabs/PlayersTab';
import type { PlayerActionValues } from './components/players/PlayerActionDialog';
import { ModFilesTab } from './components/tabs/ModFilesTab';
import { ModsTab } from './components/tabs/ModsTab';
import { CreateServerWizard, type WizardActions } from './components/wizard/CreateServerWizard';
import type { WizardOrigin } from './components/wizard/wizardTypes';
import { NetworkTab } from './components/tabs/NetworkTab';
import { BackupsTab } from './components/tabs/BackupsTab';
import { EditServerModal } from './components/modals/EditServerModal';
import { ModCatalogDialog } from './components/modals/ModCatalogDialog';
import { PlayerInventoryModal } from './components/modals/PlayerInventoryModal';
import { WelcomeEmptyState } from './components/common/WelcomeEmptyState';
import { useAppUpdater } from './hooks/useAppUpdater';
import { UpdateBanner } from './components/common/UpdateBanner';

export default function App() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const updater = useAppUpdater();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [localError, setLocalError] = useState<DaemonErrorPayload | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; origin: WizardOrigin }>({ open: false, origin: 'create' });
  const openWizard = useCallback((origin: WizardOrigin) => setWizard({ open: true, origin }), []);
  const closeWizard = useCallback(() => setWizard((current) => ({ ...current, open: false })), []);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [inspectingPlayer, setInspectingPlayer] = useState<PlayerState | null>(null);

  const {
    status,
    metrics,
    players,
    inventory,
    inventoryError,
    clearInventory,
    logs,
    provisionLogs,
    provisionJob,
    instanceStatuses,
    lastError,
    connectionState,
    sendAction,
    clearError,
    resetProvisionLogs,
    resetInstanceView
  } = useDaemonSocket();

  const health = useDaemonHealth(connectionState);

  const handleError = useCallback((err: unknown) => {
    setLocalError(toErrorPayload(err));
  }, []);

  const handleDismissError = useCallback(() => {
    clearError();
    setLocalError(null);
  }, [clearError]);

  const instances = useInstances(connectionState, handleError);

  // Each server has its own console, status, metrics and players: switching servers swaps the whole view.
  const instanceStatusesRef = useRef(instanceStatuses);
  useEffect(() => {
    instanceStatusesRef.current = instanceStatuses;
  }, [instanceStatuses]);
  const viewedInstanceId = instances.activeId;
  // Status reported by the instance list: socket status events only arrive on changes, so after (re)connecting
  // a server that is already running would otherwise show as offline.
  const listedStatusRef = useRef<Record<string, ServerStatus | undefined>>({});
  useEffect(() => {
    listedStatusRef.current = Object.fromEntries(instances.instances.map((instance) => [instance.id, instance.status]));
  }, [instances.instances]);
  const lastViewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!viewedInstanceId || connectionState !== 'open') return;
    let ignore = false;
    // Same server (first load or a reconnect): the socket just sent its live data, so keep it.
    const keepLive = lastViewedRef.current === null || lastViewedRef.current === viewedInstanceId;
    lastViewedRef.current = viewedInstanceId;
    void fetchConsoleBuffer(viewedInstanceId)
      .catch(() => [] as string[])
      .then((lines) => {
        if (ignore) return;
        const status =
          instanceStatusesRef.current[viewedInstanceId] ?? listedStatusRef.current[viewedInstanceId] ?? 'OFFLINE';
        resetInstanceView(lines, status, keepLive);
      });
    return () => {
      ignore = true;
    };
  }, [viewedInstanceId, connectionState, resetInstanceView]);
  const hasNoServers = !instances.isLoading && instances.instances.length === 0;

  // Servers exist but none is active (fresh registry): pick the first so the panel is never empty.
  const { instances: instanceList, activeInstance, isLoading: isLoadingInstances, selectInstance } = instances;
  useEffect(() => {
    if (!isLoadingInstances && instanceList.length > 0 && !activeInstance) {
      void selectInstance(instanceList[0].id);
    }
  }, [activeInstance, instanceList, isLoadingInstances, selectInstance]);
  const [gamesReloadKey, setGamesReloadKey] = useState(0);
  const [isPacksOpen, setIsPacksOpen] = useState(false);
  const games = useGames(connectionState, gamesReloadKey);
  const metricsHistory = useMetricsHistory(metrics, status);
  const { toast } = useToast();
  const appVersion = useAppVersion();
  const activeGame = games.find((game) => game.id === instances.activeInstance?.gameId);
  const locales = useLocales(connectionState);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const tabs = availableTabs(activeGame);
  const currentTab = resolveActiveTab(activeTab, tabs);
  const modFiles = useModFiles(
    connectionState,
    instances.activeId,
    handleError,
    `${instances.activeInstance?.bridgeInstalled ?? false}:${instances.activeInstance?.loader ?? ''}`
  );
  // Bridge-only features appear only when the connected bridge advertised them (or in mock mode).
  const canInspectInventory =
    (metrics.bridgeCapabilities?.includes('inventory.view') ?? false) || (health?.mockEnabled ?? false);
  const configFiles = useConfigFiles(connectionState, instances.activeId, handleError);
  const modConfigs = useModConfigs(
    connectionState,
    handleError,
    `${instances.activeId}:${instances.activeInstance?.bridgeInstalled ?? false}:${instances.activeInstance?.loader ?? ''}`
  );

  const activeError = lastError || localError;

  // Manual checks always answer: new version (the banner shows), up to date, or why it failed.
  const handleManualUpdateCheck = useCallback(async () => {
    const result = await updater.checkForUpdates();
    if (result.status === 'up_to_date') {
      toast({ title: t('updater.up_to_date'), variant: 'info' });
    } else if (result.status === 'error') {
      toast({ title: t('updater.check_failed'), description: result.message, variant: 'error' });
    } else {
      toast({ title: t('updater.update_available_title'), description: result.version, variant: 'success' });
    }
  }, [t, toast, updater]);

  const handleSendCommand = useCallback(
    (command: string) => {
      sendAction('COMMAND', command);
    },
    [sendAction]
  );

  // The daemon runs the game's declared action (through the bridge or as console commands).
  const handleRunPlayerAction = useCallback(
    (actionId: string, username: string, values?: PlayerActionValues) => {
      sendAction('PLAYER_ACTION', { actionId, username, values: values ?? {} });
    },
    [sendAction]
  );

  const handleInspectInventory = useCallback(
    (player: PlayerState) => {
      setInspectingPlayer(player);
      sendAction('INVENTORY_VIEW', { username: player.username });
    },
    [sendAction]
  );

  const handleCloseInventory = useCallback(() => {
    setInspectingPlayer(null);
    clearInventory();
  }, [clearInventory]);

  const handleRefreshInventory = useCallback(() => {
    if (inspectingPlayer) {
      clearInventory();
      sendAction('INVENTORY_VIEW', { username: inspectingPlayer.username });
    }
  }, [clearInventory, inspectingPlayer, sendAction]);

  // The game names the player action that empties an inventory (`playerView.inventoryClearAction`).
  const inventoryClearAction = activeGame?.playerView?.inventoryClearAction;
  const handleClearInspectedInventory = useCallback(() => {
    if (inspectingPlayer && inventoryClearAction) {
      handleRunPlayerAction(inventoryClearAction, inspectingPlayer.username);
      setTimeout(() => {
        sendAction('INVENTORY_VIEW', { username: inspectingPlayer.username });
      }, 200);
    }
  }, [handleRunPlayerAction, inspectingPlayer, inventoryClearAction, sendAction]);

  const handleRestartServer = useCallback(async () => {
    try {
      await instances.restartServer(instances.activeId);
    } catch (err) {
      handleError(err);
    }
  }, [handleError, instances]);

  const handleCreateServer = useCallback(
    async (params: {
      variant: string;
      version: string;
      build?: string;
      instanceId: string;
      instanceName: string;
      settings?: Partial<InstanceSettings>;
    }) => {
      resetProvisionLogs([
        `[Provisioner] Initializing ${params.variant.toUpperCase()} ${params.version}${params.build ? ` (build ${params.build})` : ''} for "${params.instanceName}"...`
      ]);
      try {
        const started = await installServer(
          params.variant,
          params.version,
          params.instanceId,
          params.instanceName,
          params.settings,
          params.build
        );
        await waitForProvisionJob(started.jobId);
        await instances.refresh();
      } catch (err) {
        if (toErrorPayload(err).code !== 'INSTALL_CANCELLED') handleError(err);
        throw err;
      }
    },
    [handleError, instances, resetProvisionLogs]
  );

  const handleUploadServerFile = useCallback(
    async (params: {
      file: File;
      instanceId: string;
      instanceName: string;
      settings?: Partial<InstanceSettings>;
      variant?: string;
      gameVersion?: string;
    }) => {
      resetProvisionLogs([
        `[Provisioner] Uploading server binary "${params.file.name}" for "${params.instanceName}"...`
      ]);
      try {
        const result = await uploadServerFile(
          params.file,
          params.instanceId,
          params.instanceName,
          params.settings,
          { variant: params.variant, gameVersion: params.gameVersion }
        );
        if (result.jobId) await waitForProvisionJob(result.jobId);
        await instances.refresh();
      } catch (err) {
        if (toErrorPayload(err).code !== 'INSTALL_CANCELLED') handleError(err);
        throw err;
      }
    },
    [handleError, instances, resetProvisionLogs]
  );

  const handleCancelInstall = useCallback(() => {
    if (provisionJob?.status === 'running') {
      cancelProvisionJob(provisionJob.id).catch(handleError);
    }
  }, [handleError, provisionJob]);

  const wizardActions: WizardActions = {
    install: async (params) => handleCreateServer(params),
    uploadServerFile: async (params) => handleUploadServerFile(params),
    createInstance: async (id, name, settings) => {
      try {
        const created = await instances.createInstance(id, name, settings);
        await instances.selectInstance(created.id);
        const driver = games.find((candidate) => candidate.id === settings.gameId);
        if (driver?.provision && driver.provision.type !== 'none') {
          resetProvisionLogs([`[Provisioner] Installing ${driver.name}...`]);
          const started = await provisionInstance(created.id);
          await waitForProvisionJob(started.jobId);
          await instances.refresh();
        }
        return created.id;
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    importInstance: async (folderPath, name) => {
      try {
        const imported = await instances.importInstance(folderPath, name);
        await instances.selectInstance(imported.id);
        return imported.id;
      } catch (err) {
        handleError(err);
        throw err;
      }
    }
  };

  const handleWizardFinish = (instanceId: string, start: boolean) => {
    void instances.selectInstance(instanceId).then(() => {
      if (start) sendAction('START');
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-canvas text-ink overflow-hidden transition-colors">
      {isTauriRuntime() && <TitleBar />}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          instances={instances.instances}
          activeInstanceId={instances.activeId}
          statuses={instanceStatuses}
          onSelectInstance={(id) => {
            void instances.selectInstance(id);
          }}
          onCreate={() => openWizard('create')}
          onImport={() => openWizard('import')}
          onOpenGamePacks={() => setIsPacksOpen(true)}
          languages={locales.options}
          currentLanguage={locales.current}
          onChangeLanguage={(code) => void locales.select(code)}
          onEditInstance={(id) => {
            void instances.selectInstance(id).then(() => setIsEditModalOpen(true));
          }}
          onOpenFolder={(id) => {
            openInstanceFolder(id).catch((err: unknown) => {
              const payload = toErrorPayload(err);
              toast({
                title: t('sidebar.open_folder_failed'),
                description: t(`errors.${payload.code}`, { defaultValue: payload.message }),
                variant: 'error'
              });
            });
          }}
          onRenameInstance={async (id, name) => {
            await instances.updateSettings(id, { name }).catch(() => undefined);
          }}
          onToggleFavorite={async (id, favorite) => {
            await instances.updateSettings(id, { favorite }).catch(() => undefined);
          }}
          onRemoveInstance={async (id) => {
            await instances.deleteInstance(id).catch(() => undefined);
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
          appVersion={appVersion}
          onCheckUpdates={isTauriRuntime() ? handleManualUpdateCheck : undefined}
          isCheckingUpdates={updater.isChecking}
          onMock={import.meta.env.DEV && health?.mockEnabled ? () => sendAction('MOCK') : undefined}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {instances.activeInstance && !hasNoServers && (
            <ServerHeader
              instance={instances.activeInstance}
              status={status}
              game={activeGame}
              tabs={tabs}
              activeTab={currentTab}
              onTabChange={setActiveTab}
              onSendAction={sendAction}
              onRestart={handleRestartServer}
              onEdit={() => setIsEditModalOpen(true)}
            />
          )}

          <ErrorAlert error={activeError} onDismiss={handleDismissError} />

          <main className="flex-1 overflow-hidden">
            {hasNoServers || !instances.activeInstance ? (
              instances.isLoading ? (
                <div className="space-y-4 p-6">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <WelcomeEmptyState
                  onCreateServer={() => openWizard('create')}
                />
              )
            ) : (
              <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-6 p-6">
                {currentTab === 'overview' && (
                  <OverviewTab
                    metrics={metrics}
                    players={players}
                    logs={logs}
                    instance={instances.activeInstance}
                    status={status}
                    onSendCommand={handleSendCommand}
                    onRunAction={handleRunPlayerAction}
                    onOpenEditModal={() => setIsEditModalOpen(true)}
                    onRestart={handleRestartServer}
                    onInspectInventory={canInspectInventory ? handleInspectInventory : undefined}
                    history={metricsHistory}
                    game={activeGame}
                  />
                )}

                {currentTab === 'players' && instances.activeInstance && (
                  <PlayersTab
                    instanceId={instances.activeInstance.id}
                    status={status}
                    players={players}
                    game={activeGame}
                    onSendCommand={handleSendCommand}
                    onRunAction={handleRunPlayerAction}
                    onInspectInventory={canInspectInventory ? handleInspectInventory : undefined}
                  />
                )}

                {currentTab === 'mod_files' && (
                  <ModFilesTab
                    files={modFiles.files}
                    filter={modFiles.filter}
                    onFilterChange={modFiles.setFilter}
                    onToggleMod={modFiles.toggleMod}
                    onDeleteMod={modFiles.deleteMod}
                    onOpenConfigTab={() => setActiveTab('mods')}
                    onBrowseCatalog={activeGame?.modSources?.length ? () => setIsCatalogOpen(true) : undefined}
                  />
                )}

                {currentTab === 'mods' && (
                  <ModsTab
                    files={modConfigs.files}
                    selectedFile={modConfigs.selectedFile}
                    entries={modConfigs.entries}
                    filter={modConfigs.filter}
                    onFilterChange={modConfigs.setFilter}
                    onSelectFile={modConfigs.selectFile}
                    onUpdateEntry={modConfigs.updateEntry}
                    onSave={async () => {
                      await modConfigs.save();
                      toast({ title: t('toast.saved'), variant: 'success' });
                    }}
                  />
                )}

                {currentTab === 'backups' && instances.activeInstance && (
                  <BackupsTab
                    instanceId={instances.activeInstance.id}
                    isRunning={status !== 'OFFLINE'}
                    game={activeGame}
                    currentVariant={instances.activeInstance.loader}
                    currentVersion={instances.activeInstance.loaderVersion}
                  />
                )}

                {currentTab === 'network' && instances.activeInstance && (
                  <NetworkTab instanceId={instances.activeInstance.id} port={instances.activeInstance.port} />
                )}

                {currentTab === 'properties' && (
                  <ConfigFilesTab
                    config={{
                      ...configFiles,
                      save: async () => {
                        await configFiles.save();
                        toast({ title: t('toast.saved'), variant: 'success' });
                      }
                    }}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Creation wizard (create + import) and edit modal */}
      <CreateServerWizard
        isOpen={wizard.open}
        initialOrigin={wizard.origin}
        onClose={closeWizard}
        games={games}
        instances={instances.instances}
        actions={wizardActions}
        provisionLogs={provisionLogs}
        provisionJob={provisionJob}
        onCancelInstall={handleCancelInstall}
        onFinish={handleWizardFinish}
      />

      <GamePacksDialog
        open={isPacksOpen}
        onClose={() => setIsPacksOpen(false)}
        onChanged={() => setGamesReloadKey((key) => key + 1)}
      />

      {activeGame?.modSources?.length && instances.activeInstance ? (
        <ModCatalogDialog
          open={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
          instanceId={instances.activeInstance.id}
          sources={activeGame.modSources}
          onInstalled={() => void modFiles.refresh()}
        />
      ) : null}

      <EditServerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        instance={instances.activeInstance}
        serverStatus={status}
        onSaveSettings={instances.updateSettings}
        onRefreshInstances={instances.refresh}
        jvmFlagPresets={activeGame?.jvmFlagPresets}
        game={activeGame}
      />

      {/* Auto-updater Notification Banner */}
      <UpdateBanner updater={updater} />

      {/* Player Inventory Inspector Modal */}
      {inspectingPlayer && (
        <PlayerInventoryModal
          player={inspectingPlayer}
          inventory={inventory}
          error={inventoryError}
          isLoading={!inventory}
          onClose={handleCloseInventory}
          game={activeGame}
          onRefresh={handleRefreshInventory}
          onClearInventory={inventoryClearAction ? handleClearInspectedInventory : undefined}
        />
      )}
    </div>
  );
}
