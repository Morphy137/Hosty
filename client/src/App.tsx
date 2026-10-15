import { useState, useCallback, useEffect } from 'react';
import { useDaemonSocket } from './hooks/useDaemonSocket';
import { useDaemonHealth } from './hooks/useDaemonHealth';
import { useInstances } from './hooks/useInstances';
import { useModFiles } from './hooks/useModFiles';
import { useServerProperties } from './hooks/useServerProperties';
import { useModConfigs } from './hooks/useModConfigs';
import {
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
import { useAppVersion } from './hooks/useAppVersion';
import { isTauriRuntime } from './config/daemon';
import { ErrorAlert } from './components/common/ErrorAlert';
import { OverviewTab } from './components/tabs/OverviewTab';
import { PlayersTab } from './components/tabs/PlayersTab';
import { ModFilesTab } from './components/tabs/ModFilesTab';
import { PropertiesTab } from './components/tabs/PropertiesTab';
import { ModsTab } from './components/tabs/ModsTab';
import { CreateServerModal } from './components/modals/CreateServerModal';
import { ImportServerModal } from './components/modals/ImportServerModal';
import { EditServerModal } from './components/modals/EditServerModal';
import { PlayerInventoryModal } from './components/modals/PlayerInventoryModal';
import { WelcomeEmptyState } from './components/common/WelcomeEmptyState';
import { useAppUpdater } from './hooks/useAppUpdater';
import { UpdateBanner } from './components/common/UpdateBanner';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const updater = useAppUpdater();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [localError, setLocalError] = useState<DaemonErrorPayload | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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
  const games = useGames(connectionState);
  const appVersion = useAppVersion();
  const activeGame = games.find((game) => game.id === (instances.activeInstance?.gameId ?? 'minecraft'));
  const tabs = availableTabs(activeGame);
  const currentTab = resolveActiveTab(activeTab, tabs);
  const modFiles = useModFiles(connectionState, instances.activeId, handleError);
  const serverProperties = useServerProperties(connectionState, handleError);
  const modConfigs = useModConfigs(connectionState, handleError);

  const activeError = lastError || localError;

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
      handleSendCommand(`clear ${inspectingPlayer.username}`);
      setTimeout(() => {
        sendAction('ACTION', { action: 'INVENTORY_VIEW', username: inspectingPlayer.username });
      }, 200);
    }
  }, [handleSendCommand, inspectingPlayer, sendAction]);

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

  const handleImportServer = useCallback(
    async (folderPath: string, name?: string) => {
      try {
        const imported = await instances.importInstance(folderPath, name);
        await instances.selectInstance(imported.id);
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [handleError, instances]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-canvas text-ink select-none overflow-hidden transition-colors">
      {isTauriRuntime() && <TitleBar />}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          instances={instances.instances}
          activeInstanceId={instances.activeId}
          statuses={instanceStatuses}
          onSelectInstance={(id) => {
            void instances.selectInstance(id);
          }}
          onCreate={() => setIsCreateModalOpen(true)}
          onImport={() => setIsImportModalOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          appVersion={appVersion}
          onCheckUpdates={isTauriRuntime() ? updater.checkForUpdates : undefined}
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
                  onCreateServer={() => setIsCreateModalOpen(true)}
                  onImportServer={() => setIsImportModalOpen(true)}
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
                    onInspectInventory={handleInspectInventory}
                  />
                )}

                {currentTab === 'players' && (
                  <PlayersTab
                    players={players}
                    onSendCommand={handleSendCommand}
                    onSendAction={sendAction}
                    onInspectInventory={handleInspectInventory}
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
                    onSave={modConfigs.save}
                  />
                )}

                {currentTab === 'properties' && (
                  <PropertiesTab
                    entries={serverProperties.entries}
                    filter={serverProperties.filter}
                    onFilterChange={serverProperties.setFilter}
                    onUpdateEntry={serverProperties.updateEntry}
                    onSave={serverProperties.save}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Creation, Import, and Edit Modals */}
      <CreateServerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onInstall={handleCreateServer}
        onUploadJar={handleUploadServerJar}
        provisionLogs={provisionLogs}
        provisionJob={provisionJob}
        onCancelInstall={handleCancelInstall}
      />

      <ImportServerModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportServer}
      />

      <EditServerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        instance={instances.activeInstance}
        serverStatus={status}
        onSaveSettings={instances.updateSettings}
        onRefreshInstances={instances.refresh}
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
