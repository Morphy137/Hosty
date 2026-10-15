import { useState, useCallback, useEffect } from 'react';
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
  toErrorPayload,
  installServer,
  uploadServerJar,
  waitForProvisionJob,
  cancelProvisionJob
} from './api/daemonApi';
import type { DaemonErrorPayload, ServerLoader, InstanceSettings, PlayerState } from './types/daemon';
import { useTheme } from './hooks/useTheme';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { ServerHeader } from './components/layout/ServerHeader';
import { Skeleton } from './components/ui/Skeleton';
import { availableTabs, resolveActiveTab, type TabId } from './utils/tabs';
import { useGames } from './hooks/useGames';
import { renderPlayerCommand } from './utils/playerActions';
import { useLocales } from './hooks/useLocales';
import { useAppVersion } from './hooks/useAppVersion';
import { useMetricsHistory } from './hooks/useMetricsHistory';
import { useToast } from './components/ui/toastContext';
import { isTauriRuntime } from './config/daemon';
import { ErrorAlert } from './components/common/ErrorAlert';
import { OverviewTab } from './components/tabs/OverviewTab';
import { GenericPlayersTab } from './components/tabs/GenericPlayersTab';
import { PLAYER_PANELS } from './components/tabs/playerPanels';
import { ModFilesTab } from './components/tabs/ModFilesTab';
import { ModsTab } from './components/tabs/ModsTab';
import { CreateServerWizard, type WizardActions } from './components/wizard/CreateServerWizard';
import type { WizardOrigin } from './components/wizard/wizardTypes';
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
    clearInventory,
    logs,
    provisionLogs,
    provisionJob,
    instanceStatuses,
    lastError,
    connectionState,
    sendAction,
    clearError,
    resetProvisionLogs
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
  // Rich panels are looked up by the id the game declares; everything else uses the generic list.
  const PlayersPanel = (activeGame?.playerPanel && PLAYER_PANELS[activeGame.playerPanel]) || GenericPlayersTab;
  const currentTab = resolveActiveTab(activeTab, tabs);
  const modFiles = useModFiles(connectionState, instances.activeId, handleError);
  // Bridge-only features appear only when the connected bridge advertised them (or in mock mode).
  const canInspectInventory =
    (metrics.bridgeCapabilities?.includes('inventory.view') ?? false) || (health?.mockEnabled ?? false);
  const configFiles = useConfigFiles(connectionState, instances.activeId, handleError);
  const modConfigs = useModConfigs(connectionState, handleError);

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

  const handleInspectInventory = useCallback(
    (player: PlayerState) => {
      setInspectingPlayer(player);
      sendAction('ACTION', { action: 'INVENTORY_VIEW', username: player.username });
    },
    [sendAction]
  );

  const handleCloseInventory = useCallback(() => {
    setInspectingPlayer(null);
    clearInventory();
  }, [clearInventory]);

  const handleRefreshInventory = useCallback(() => {
    if (inspectingPlayer) {
      sendAction('ACTION', { action: 'INVENTORY_VIEW', username: inspectingPlayer.username });
    }
  }, [inspectingPlayer, sendAction]);

  const handleClearInspectedInventory = useCallback(() => {
    if (inspectingPlayer) {
      const clear = activeGame?.playerActions?.find((action) => action.id === 'clear');
      if (clear) handleSendCommand(renderPlayerCommand(clear, inspectingPlayer.username));
      setTimeout(() => {
        sendAction('ACTION', { action: 'INVENTORY_VIEW', username: inspectingPlayer.username });
      }, 200);
    }
  }, [activeGame, handleSendCommand, inspectingPlayer, sendAction]);

  const handleRestartServer = useCallback(async () => {
    try {
      await instances.restartServer(instances.activeId);
    } catch (err) {
      handleError(err);
    }
  }, [handleError, instances]);

  const handleCreateServer = useCallback(
    async (params: {
      loader: ServerLoader;
      version: string;
      instanceId: string;
      instanceName: string;
      settings?: Partial<InstanceSettings>;
    }) => {
      resetProvisionLogs([
        `[Provisioner] Initializing ${params.loader.toUpperCase()} ${params.version} for "${params.instanceName}"...`
      ]);
      try {
        const started = await installServer(
          params.loader,
          params.version,
          params.instanceId,
          params.instanceName,
          params.settings
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

  const handleUploadServerJar = useCallback(
    async (params: {
      file: File;
      instanceId: string;
      instanceName: string;
      settings?: Partial<InstanceSettings>;
      loader?: ServerLoader;
      loaderVersion?: string;
    }) => {
      resetProvisionLogs([
        `[Provisioner] Uploading server binary "${params.file.name}" for "${params.instanceName}"...`
      ]);
      try {
        const result = await uploadServerJar(
          params.file,
          params.instanceId,
          params.instanceName,
          params.settings,
          { loader: params.loader, loaderVersion: params.loaderVersion }
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
    uploadJar: async (params) => handleUploadServerJar(params),
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
                    onSendAction={sendAction}
                    onOpenEditModal={() => setIsEditModalOpen(true)}
                    onRestart={handleRestartServer}
                    onInspectInventory={canInspectInventory ? handleInspectInventory : undefined}
                    history={metricsHistory}
                    gameName={activeGame?.name}
                    quickCommands={activeGame?.quickCommands ?? []}
                    richPlayers={Boolean(activeGame?.playerPanel && PLAYER_PANELS[activeGame.playerPanel])}
                    playerActions={activeGame?.playerActions ?? []}
                    playerView={activeGame?.playerView}
                  />
                )}

                {currentTab === 'players' && (
                  <PlayersPanel
                    players={players}
                    onSendCommand={handleSendCommand}
                    onSendAction={sendAction}
                    onInspectInventory={canInspectInventory ? handleInspectInventory : undefined}
                    playerActions={activeGame?.playerActions ?? []}
                    playerView={activeGame?.playerView}
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
      />

      {/* Auto-updater Notification Banner */}
      <UpdateBanner updater={updater} />

      {/* Player Inventory Inspector Modal */}
      {inspectingPlayer && (
        <PlayerInventoryModal
          player={inspectingPlayer}
          inventory={inventory}
          isLoading={!inventory}
          onClose={handleCloseInventory}
          onRefresh={handleRefreshInventory}
          onClearInventory={handleClearInspectedInventory}
        />
      )}
    </div>
  );
}
