import { useState, useCallback } from 'react';
import { useDaemonSocket } from './hooks/useDaemonSocket';
import { useDaemonHealth } from './hooks/useDaemonHealth';
import { useInstances } from './hooks/useInstances';
import { useModFiles } from './hooks/useModFiles';
import { useServerProperties } from './hooks/useServerProperties';
import { useModConfigs } from './hooks/useModConfigs';
import { toErrorPayload, installServer, uploadServerJar } from './api/daemonApi';
import type { DaemonErrorPayload, ServerLoader } from './types/daemon';
import { Header, type TabId } from './components/layout/Header';
import { ErrorAlert } from './components/common/ErrorAlert';
import { OverviewTab } from './components/tabs/OverviewTab';
import { PlayersTab } from './components/tabs/PlayersTab';
import { ModFilesTab } from './components/tabs/ModFilesTab';
import { PropertiesTab } from './components/tabs/PropertiesTab';
import { ModsTab } from './components/tabs/ModsTab';
import { CreateServerModal } from './components/modals/CreateServerModal';
import { ImportServerModal } from './components/modals/ImportServerModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [localError, setLocalError] = useState<DaemonErrorPayload | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const {
    status,
    metrics,
    players,
    logs,
    provisionLogs,
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

  const handleCreateServer = useCallback(
    async (params: {
      loader: ServerLoader;
      version: string;
      instanceId: string;
      instanceName: string;
    }) => {
      resetProvisionLogs([
        `[Provisioner] Initializing ${params.loader.toUpperCase()} ${params.version} for "${params.instanceName}"...`
      ]);
      try {
        await installServer(params.loader, params.version, params.instanceId, params.instanceName);
        await instances.refresh();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [handleError, instances, resetProvisionLogs]
  );

  const handleUploadServerJar = useCallback(
    async (params: { file: File; instanceId: string; instanceName: string }) => {
      resetProvisionLogs([
        `[Provisioner] Uploading server binary "${params.file.name}" for "${params.instanceName}"...`
      ]);
      try {
        await uploadServerJar(params.file, params.instanceId, params.instanceName);
        await instances.refresh();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [handleError, instances, resetProvisionLogs]
  );

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
    <div className="h-screen w-screen flex flex-col bg-[#fafafa] select-none overflow-hidden">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        status={status}
        mockEnabled={health?.mockEnabled ?? true}
        onSendAction={sendAction}
        instances={instances.instances}
        activeInstanceId={instances.activeId}
        onSelectInstance={instances.selectInstance}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
      />

      <ErrorAlert error={activeError} onDismiss={handleDismissError} />

      <main className="flex-1 overflow-hidden">
        <div className="max-w-[1400px] mx-auto h-full p-6 flex flex-col gap-6">
          {activeTab === 'overview' && (
            <OverviewTab
              metrics={metrics}
              players={players}
              logs={logs}
              onSendCommand={handleSendCommand}
            />
          )}

          {activeTab === 'players' && (
            <PlayersTab players={players} onSendCommand={handleSendCommand} />
          )}

          {activeTab === 'mod_files' && (
            <ModFilesTab
              files={modFiles.files}
              filter={modFiles.filter}
              onFilterChange={modFiles.setFilter}
              onToggleMod={modFiles.toggleMod}
              onDeleteMod={modFiles.deleteMod}
              onOpenConfigTab={() => setActiveTab('mods')}
            />
          )}

          {activeTab === 'mods' && (
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

          {activeTab === 'properties' && (
            <PropertiesTab
              entries={serverProperties.entries}
              filter={serverProperties.filter}
              onFilterChange={serverProperties.setFilter}
              onUpdateEntry={serverProperties.updateEntry}
              onSave={serverProperties.save}
            />
          )}
        </div>
      </main>

      {/* Creation and Import Modals */}
      <CreateServerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onInstall={handleCreateServer}
        onUploadJar={handleUploadServerJar}
        provisionLogs={provisionLogs}
      />

      <ImportServerModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportServer}
      />
    </div>
  );
}