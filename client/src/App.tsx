import { useState, useCallback } from 'react';
import { useDaemonSocket } from './hooks/useDaemonSocket';
import { useDaemonHealth } from './hooks/useDaemonHealth';
import { useServerProperties } from './hooks/useServerProperties';
import { useModConfigs } from './hooks/useModConfigs';
import { useProvisioning } from './hooks/useProvisioning';
import { toErrorPayload } from './api/daemonApi';
import type { DaemonErrorPayload } from './types/daemon';
import { Header, type TabId } from './components/layout/Header';
import { ErrorAlert } from './components/common/ErrorAlert';
import { OverviewTab } from './components/tabs/OverviewTab';
import { PropertiesTab } from './components/tabs/PropertiesTab';
import { ModsTab } from './components/tabs/ModsTab';
import { ProvisioningTab } from './components/tabs/ProvisioningTab';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [localError, setLocalError] = useState<DaemonErrorPayload | null>(null);

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

  const serverProperties = useServerProperties(connectionState, handleError);
  const modConfigs = useModConfigs(connectionState, handleError);
  const provisioning = useProvisioning(connectionState, handleError);

  const activeError = lastError || localError;

  const handleInstallServer = useCallback(() => {
    provisioning.install((loader, version) => {
      resetProvisionLogs([`[Provisioner] Initiating ${loader.toUpperCase()} ${version} install...`]);
    });
  }, [provisioning, resetProvisionLogs]);

  const handleSendCommand = useCallback(
    (command: string) => {
      sendAction('COMMAND', command);
    },
    [sendAction]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fafafa] select-none overflow-hidden">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        status={status}
        mockEnabled={health?.mockEnabled ?? true}
        onSendAction={sendAction}
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

          {activeTab === 'properties' && (
            <PropertiesTab
              entries={serverProperties.entries}
              filter={serverProperties.filter}
              onFilterChange={serverProperties.setFilter}
              onUpdateEntry={serverProperties.updateEntry}
              onSave={serverProperties.save}
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

          {activeTab === 'provisioning' && (
            <ProvisioningTab
              selectedLoader={provisioning.selectedLoader}
              onSelectLoader={provisioning.setSelectedLoader}
              availableVersions={provisioning.availableVersions}
              selectedVersion={provisioning.selectedVersion}
              onSelectVersion={provisioning.setSelectedVersion}
              isInstalling={provisioning.isInstalling}
              provisionLogs={provisionLogs}
              serverStatus={status}
              onInstall={handleInstallServer}
            />
          )}
        </div>
      </main>
    </div>
  );
}