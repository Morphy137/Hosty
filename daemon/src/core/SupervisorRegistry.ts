import { EventEmitter } from 'events';
import {
  ProcessSupervisor,
  type ServerConfig,
  type ServerMetrics,
  type ServerStatus,
  type PlayerState,
  type SupervisorFailure
} from './ProcessSupervisor';
import type { InstanceInfo } from './InstanceManager';
import { telemetryBridge } from './bridge/TelemetryBridgeManager';
import type { BridgeActionMessage } from './bridge/BridgeProtocol';

export interface SupervisorRegistryEvents {
  status: [instanceId: string, status: ServerStatus];
  metrics: [instanceId: string, metrics: ServerMetrics];
  players: [instanceId: string, players: PlayerState[]];
  console: [instanceId: string, line: string];
  failure: [instanceId: string, failure: SupervisorFailure];
}

export interface RegistryDefaults {
  defaultJavaPath: string;
  defaultJarFile: string;
  stopTimeoutMs: number;
  metricsIntervalMs: number;
  positionPollIntervalMs: number;
}

export class SupervisorRegistry extends EventEmitter<SupervisorRegistryEvents> {
  private readonly supervisors = new Map<string, ProcessSupervisor>();
  private readonly defaults: RegistryDefaults;

  constructor(defaults: RegistryDefaults) {
    super();
    this.defaults = defaults;

    telemetryBridge.on('bridge_connected', (instanceId, loader, version) => {
      const sup = this.supervisors.get(instanceId);
      if (sup) {
        sup.setBridgeCapabilities(telemetryBridge.getSession(instanceId)?.capabilities ?? []);
        sup.setBridgeActive(true);
      }
      this.emit('console', instanceId, `[Hypervisor] MC-Nexus Bridge connected (${loader || 'plugin'} ${version || ''}). Real-time telemetry active.\r\n`);
    });

    telemetryBridge.on('bridge_disconnected', (instanceId) => {
      const sup = this.supervisors.get(instanceId);
      if (sup) {
        sup.setBridgeCapabilities([]);
        sup.setBridgeActive(false);
      }
      this.emit('console', instanceId, `[Hypervisor] MC-Nexus Bridge disconnected. Fallback stdout active.\r\n`);
    });

    telemetryBridge.on('telemetry', (instanceId, server, players) => {
      const sup = this.supervisors.get(instanceId);
      if (sup) {
        sup.setBridgeTelemetry(server, players);
      }
    });
  }

  /** Forgets a stopped instance's supervisor (used when the instance is removed). */
  public removeSupervisor(instanceId: string): void {
    this.supervisors.delete(instanceId);
  }

  public getSupervisor(instanceId: string): ProcessSupervisor | undefined {
    return this.supervisors.get(instanceId);
  }

  public getOrCreateSupervisor(instance: InstanceInfo): ProcessSupervisor {
    const existing = this.supervisors.get(instance.id);
    if (existing) {
      // Keep working dir and RAM / JVM flags up to date
      existing.updateConfig({
        workingDir: instance.dir,
        javaPath: instance.javaPath || this.defaults.defaultJavaPath,
        minRamMb: instance.minRamMb,
        maxRamMb: instance.maxRamMb,
        jvmArgs: instance.jvmArgs,
        forceSaveOnStop: instance.forceSaveOnStop,
        gameId: instance.gameId,
        name: instance.name,
        port: instance.port,
        maxPlayers: instance.maxPlayers,
        gameConfig: instance.gameConfig
      });
      return existing;
    }

    const config: ServerConfig = {
      id: instance.id,
      workingDir: instance.dir,
      jarFile: instance.launchFile || this.defaults.defaultJarFile,
      javaPath: instance.javaPath || this.defaults.defaultJavaPath,
      minRamMb: instance.minRamMb,
      maxRamMb: instance.maxRamMb,
      stopTimeoutMs: this.defaults.stopTimeoutMs,
      metricsIntervalMs: this.defaults.metricsIntervalMs,
      positionPollIntervalMs: this.defaults.positionPollIntervalMs,
      jvmArgs: instance.jvmArgs,
      forceSaveOnStop: instance.forceSaveOnStop,
      gameId: instance.gameId,
      name: instance.name,
      port: instance.port,
      maxPlayers: instance.maxPlayers,
      gameConfig: instance.gameConfig
    };

    const supervisor = new ProcessSupervisor(config);

    supervisor.on('status', (status) => this.emit('status', instance.id, status));
    supervisor.on('metrics', (metrics) => this.emit('metrics', instance.id, metrics));
    supervisor.on('players', (players) => this.emit('players', instance.id, players));
    supervisor.on('console', (line) => this.emit('console', instance.id, line));
    supervisor.on('failure', (failure) => this.emit('failure', instance.id, failure));

    this.supervisors.set(instance.id, supervisor);
    return supervisor;
  }

  public getStatus(instanceId: string): ServerStatus {
    const s = this.supervisors.get(instanceId);
    return s ? s.getStatus() : 'OFFLINE';
  }

  public getPlayers(instanceId: string): PlayerState[] {
    const s = this.supervisors.get(instanceId);
    return s ? s.getPlayers() : [];
  }

  public getConsoleBuffer(instanceId: string): string[] {
    const s = this.supervisors.get(instanceId);
    return s ? s.getConsoleBuffer() : [];
  }

  public getAllStatuses(): Record<string, ServerStatus> {
    const result: Record<string, ServerStatus> = {};
    for (const [id, sup] of this.supervisors.entries()) {
      result[id] = sup.getStatus();
    }
    return result;
  }

  public stopAll(): void {
    for (const sup of this.supervisors.values()) {
      if (sup.isRunning()) {
        sup.stop();
      }
    }
  }

  /** Requests a stop on every running server and resolves once all exited or the timeout elapsed. */
  public async stopAllAndWait(timeoutMs: number, pollMs = 200): Promise<void> {
    this.stopAll();
    const deadline = Date.now() + timeoutMs;
    const anyRunning = () => [...this.supervisors.values()].some((sup) => sup.isRunning());
    while (anyRunning() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    for (const sup of this.supervisors.values()) {
      if (sup.isRunning()) sup.kill();
    }
  }

  public isBridgeConnected(instanceId: string): boolean {
    return telemetryBridge.isBridgeConnected(instanceId);
  }

  public sendBridgeAction(
    instanceId: string,
    action: Omit<BridgeActionMessage, 'type'>
  ): boolean {
    return telemetryBridge.sendAction(instanceId, action);
  }
}
