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
        gameId: instance.gameId
      });
      return existing;
    }

    const config: ServerConfig = {
      id: instance.id,
      workingDir: instance.dir,
      jarFile: this.defaults.defaultJarFile,
      javaPath: instance.javaPath || this.defaults.defaultJavaPath,
      minRamMb: instance.minRamMb,
      maxRamMb: instance.maxRamMb,
      stopTimeoutMs: this.defaults.stopTimeoutMs,
      metricsIntervalMs: this.defaults.metricsIntervalMs,
      positionPollIntervalMs: this.defaults.positionPollIntervalMs,
      jvmArgs: instance.jvmArgs,
      forceSaveOnStop: instance.forceSaveOnStop,
      gameId: instance.gameId
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
}
