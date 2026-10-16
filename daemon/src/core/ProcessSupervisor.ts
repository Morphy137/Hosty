import { spawn as nodeSpawn, ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import pidusage from 'pidusage';
import { LineBuffer } from './LineBuffer';
import type { IGameDriver } from './drivers/IGameDriver';
import { driverRegistry } from './drivers/GameDriverRegistry';

export interface ServerConfig {
  id: string;
  workingDir: string;
  jarFile: string;
  javaPath: string;
  minRamMb: number;
  maxRamMb: number;
  stopTimeoutMs: number;
  metricsIntervalMs: number;
  positionPollIntervalMs: number;
  jvmArgs?: string[];
  forceSaveOnStop?: boolean;
  gameId?: string;
  name?: string;
  port?: number;
  maxPlayers?: number;
  gameConfig?: Record<string, string | number | boolean>;
  /** Installed variant (loader), used to pick the right launch entry. */
  loader?: string;
  /** Restart automatically (with backoff) when the process exits without being asked to. */
  autoRestart?: boolean;
  /** Restart the server every N hours while it runs; 0 or undefined disables it. */
  scheduledRestartHours?: number;
  /** First crash-restart delay; doubles per attempt (default 2000). */
  restartBackoffMs?: number;
  /** How long players are warned before a scheduled restart (default 30000). */
  restartWarnMs?: number;
}

export interface PlayerState {
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  uuid?: string;
  health?: number;
  maxHealth?: number;
  food?: number;
  ping?: number;
  gamemode?: string;
  isOp?: boolean;
  isFrozen?: boolean;
  isMuted?: boolean;
}

export interface ServerMetrics {
  cpu: number;
  ramMb: number;
  maxRamMb: number;
  uptime: number;
  tps?: number;
  mspt?: number;
  loadedChunks?: number;
  entitiesCount?: number;
  bridgeConnected?: boolean;
  /** Capabilities advertised by the connected bridge (e.g. `action.heal`, `inventory.view`). */
  bridgeCapabilities?: string[];
}

export type ServerStatus = 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING';

export type SupervisorErrorCode =
  | 'JAR_MISSING'
  | 'JAVA_NOT_FOUND'
  | 'PROCESS_ERROR'
  | 'SERVER_NOT_ONLINE'
  | 'ALREADY_RUNNING'
  | 'GAME_UNAVAILABLE';

export interface SupervisorFailure {
  code: SupervisorErrorCode;
  message: string;
}

export interface ProcessSupervisorEvents {
  console: [line: string];
  status: [status: ServerStatus];
  metrics: [metrics: ServerMetrics];
  players: [players: PlayerState[]];
  failure: [failure: SupervisorFailure];
}

export type SpawnFunction = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

const BYTES_PER_MEGABYTE = 1024 * 1024;
const CONSOLE_LINE_ENDING = '\r\n';
const CONSOLE_BUFFER_LINES = 500;
const CONSOLE_LOG_RELATIVE = path.join('.hosty', 'console.log');
const CONSOLE_LOG_FLUSH_MS = 1000;
const MAX_CRASH_RESTARTS = 5;
const DEFAULT_RESTART_BACKOFF_MS = 2000;
const MAX_RESTART_BACKOFF_MS = 60_000;
const DEFAULT_RESTART_WARN_MS = 30_000;
const MS_PER_HOUR = 3_600_000;

const WINDOWS_SCRIPT = /\.(bat|cmd)$/i;

const quoteForCmd = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/**
 * Node refuses to spawn `.bat`/`.cmd` files without a shell (EINVAL), so on Windows scripts run through
 * `cmd.exe /d /s /c` with every argument quoted. Everything else is spawned directly.
 */
export function resolveSpawnCommand(
  executable: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  comSpec: string = process.env.ComSpec || 'cmd.exe'
): { executable: string; args: string[]; verbatim: boolean } {
  if (platform !== 'win32' || !WINDOWS_SCRIPT.test(executable)) {
    return { executable, args, verbatim: false };
  }
  const commandLine = [executable, ...args].map((part) => quoteForCmd(part.replace(/[\r\n]+/g, ' '))).join(' ');
  return { executable: comSpec, args: ['/d', '/s', '/c', `"${commandLine}"`], verbatim: true };
}

export class ProcessSupervisor extends EventEmitter<ProcessSupervisorEvents> {
  private process: ChildProcessWithoutNullStreams | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private positionTimer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;
  private readonly players = new Map<string, PlayerState>();
  /** Outstanding queries issued by the poller; their output is hidden from the console. */
  private readonly pendingQueries = new Set<string>();
  private readonly consoleBuffer: string[] = [];
  private status: ServerStatus = 'OFFLINE';
  /** Null when the server's game is not loaded: the server is listed but cannot start. */
  private driver: IGameDriver | null;
  /** True once the user (or a scheduled restart) asked for the process to stop. */
  private stopRequested = false;
  private crashAttempts = 0;
  private crashRestartTimer: NodeJS.Timeout | null = null;
  private scheduleTimer: NodeJS.Timeout | null = null;
  private restartWarnTimer: NodeJS.Timeout | null = null;
  private pendingLogLines: string[] = [];
  private logFlushTimer: NodeJS.Timeout | null = null;
  private isBridgeConnected = false;
  private lastBridgeMetrics?: {
    tps: number;
    mspt: number;
    loadedChunks: number;
    entitiesCount: number;
  };

  constructor(
    private readonly config: ServerConfig,
    private readonly spawnProcess: SpawnFunction = nodeSpawn,
    driver?: IGameDriver
  ) {
    super();
    this.driver = driver ?? (config.gameId ? driverRegistry.findDriver(config.gameId) : driverRegistry.getDriver());
    this.consoleBuffer.push(...this.readPersistedConsole());
  }

  private consoleLogPath(): string {
    return path.join(path.resolve(this.config.workingDir), CONSOLE_LOG_RELATIVE);
  }

  /** Last lines of the previous run, so the console is not empty after reopening the app. */
  private readPersistedConsole(): string[] {
    try {
      const content = fs.readFileSync(this.consoleLogPath(), 'utf-8');
      const lines = content.split('\n').filter((line) => line.length > 0);
      return lines.slice(-CONSOLE_BUFFER_LINES).map((line) => `${line}${CONSOLE_LINE_ENDING}`);
    } catch {
      return [];
    }
  }

  private persistConsoleLine(line: string): void {
    this.pendingLogLines.push(line);
    if (this.logFlushTimer) return;
    this.logFlushTimer = setTimeout(() => this.flushConsoleLog(), CONSOLE_LOG_FLUSH_MS);
    this.logFlushTimer.unref();
  }

  public flushConsoleLog(): void {
    if (this.logFlushTimer) {
      clearTimeout(this.logFlushTimer);
      this.logFlushTimer = null;
    }
    if (this.pendingLogLines.length === 0) return;
    const chunk = `${this.pendingLogLines.join('\n')}\n`;
    this.pendingLogLines = [];
    const file = this.consoleLogPath();
    try {
      if (!fs.existsSync(path.dirname(file))) {
        if (!fs.existsSync(path.resolve(this.config.workingDir))) return;
        fs.mkdirSync(path.dirname(file), { recursive: true });
      }
      fs.appendFileSync(file, chunk, 'utf-8');
    } catch {
      // Persisting history is best effort.
    }
  }

  /** Adds a Hosty message to this server's own console (and its persisted history). */
  public log(message: string): void {
    this.emitConsole(message.replace(/\r?\n$/, ''));
  }

  public getStatus(): ServerStatus {
    return this.status;
  }

  public getDriver(): IGameDriver | null {
    return this.driver;
  }

  public isBridgeActive(): boolean {
    return this.isBridgeConnected;
  }

  private bridgeCapabilities: string[] = [];

  public setBridgeCapabilities(capabilities: string[]): void {
    this.bridgeCapabilities = capabilities;
  }

  public setBridgeActive(active: boolean): void {
    this.isBridgeConnected = active;
    if (active) {
      this.stopPositionPolling();
    } else if (this.status === 'ONLINE') {
      this.startPositionPolling();
    }
  }

  public setBridgeTelemetry(
    server: { tps: number; mspt: number; loadedChunks: number; entitiesCount: number },
    incomingPlayers: PlayerState[]
  ): void {
    this.isBridgeConnected = true;
    this.stopPositionPolling();
    this.lastBridgeMetrics = server;

    this.players.clear();
    for (const p of incomingPlayers) {
      this.players.set(p.username, p);
    }
    this.emitPlayers();
  }

  public getPlayers(): PlayerState[] {
    return Array.from(this.players.values());
  }

  public getConsoleBuffer(): string[] {
    return [...this.consoleBuffer];
  }

  public getConfig(): ServerConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<ServerConfig>): void {
    Object.assign(this.config, patch);
    // A running process keeps the driver it was launched with.
    if (patch.gameId && !this.process) {
      this.driver = driverRegistry.findDriver(patch.gameId);
    }
  }

  public isRunning(): boolean {
    return this.process !== null;
  }

  public setInstance(id: string, workingDir: string): void {
    if (this.process) {
      throw new Error('Cannot switch instance while server is running.');
    }
    this.config.id = id;
    this.config.workingDir = workingDir;
  }

  public start(): void {
    if (this.process) {
      this.fail('ALREADY_RUNNING', 'The server process is already running.');
      return;
    }

    const driver = this.driver;
    if (!driver) {
      this.fail('GAME_UNAVAILABLE', `The game "${this.config.gameId}" is not installed or failed to load.`);
      return;
    }

    const workingDir = path.resolve(this.config.workingDir);
    if (!driver.validateInstallation(workingDir, this.config.jarFile)) {
      this.fail('JAR_MISSING', `Server executable or valid installation not found at ${workingDir}.`);
      return;
    }

    this.stopRequested = false;
    this.clearCrashRestart();
    this.setStatus('STARTING');

    let child: ChildProcessWithoutNullStreams;
    try {
      const launchPlan = driver.buildLaunchPlan(this.config);
      const command = resolveSpawnCommand(launchPlan.executable, launchPlan.args);
      child = this.spawnProcess(command.executable, command.args, {
        cwd: launchPlan.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsVerbatimArguments: command.verbatim
      });
    } catch (err) {
      // Some failures (e.g. EINVAL for scripts, invalid arguments) are thrown synchronously by spawn.
      const error = err as NodeJS.ErrnoException;
      this.setStatus('OFFLINE');
      if (error.code === 'ENOENT') {
        this.fail('JAVA_NOT_FOUND', `Executable "${this.config.javaPath}" was not found. Install runtime or set correct path.`);
      } else {
        this.fail('PROCESS_ERROR', `The server could not be started: ${error.message}`);
      }
      return;
    }
    this.process = child;
    this.attachProcessListeners(child);
    this.startMetrics();
    this.startRestartSchedule();
  }

  public sendCommand(command: string): boolean {
    const sanitized = command.replace(/[\r\n]+/g, ' ').trim();
    if (!sanitized) return false;

    if (!this.process || this.status !== 'ONLINE') {
      this.fail('SERVER_NOT_ONLINE', 'Commands can only be sent while the server is online.');
      return false;
    }

    this.process.stdin.write(`${sanitized}\n`);
    return true;
  }

  public stop(): void {
    this.stopRequested = true;
    this.clearCrashRestart();
    if (!this.process || this.status === 'STOPPING') return;
    if (!this.driver) {
      this.kill();
      return;
    }

    if (this.config.forceSaveOnStop !== false) {
      try {
        const saveCmd = this.driver.buildSaveCommand();
        if (saveCmd) this.process.stdin.write(saveCmd);
      } catch {
        // Stream might be closed
      }
    }

    this.setStatus('STOPPING');
    this.stopPositionPolling();
    this.process.stdin.write(this.driver.buildStopCommand());
    this.stopTimer = setTimeout(() => {
      this.emitConsole(`[Hypervisor] Graceful stop timed out after ${this.config.stopTimeoutMs} ms, killing process.`);
      this.kill();
    }, this.config.stopTimeoutMs);
  }

  public restart(): void {
    if (!this.process || this.status === 'OFFLINE') {
      this.start();
      return;
    }
    const onStatus = (status: ServerStatus) => {
      if (status === 'OFFLINE') {
        this.removeListener('status', onStatus);
        setTimeout(() => this.start(), 800);
      }
    };
    this.on('status', onStatus);
    this.stop();
  }

  public kill(): void {
    this.stopRequested = true;
    if (!this.process) return;
    this.process.kill('SIGKILL');
  }

  private attachProcessListeners(child: ChildProcessWithoutNullStreams): void {
    const stdoutBuffer = new LineBuffer();
    const stderrBuffer = new LineBuffer();

    child.stdout.on('data', (data: Buffer) => {
      stdoutBuffer.push(data.toString()).forEach((line) => this.handleStdoutLine(line));
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrBuffer.push(data.toString()).forEach((line) => this.emitConsole(line));
    });

    child.stdin.on('error', (err) => {
      this.emitConsole(`[Hypervisor] Failed to write to server stdin: ${err.message}`);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        this.fail('JAVA_NOT_FOUND', `Executable "${this.config.javaPath}" was not found. Install runtime or set correct path.`);
      } else {
        this.fail('PROCESS_ERROR', err.message);
      }
      this.cleanup(child);
    });

    child.on('close', (code) => {
      stdoutBuffer.flush().forEach((line) => this.handleStdoutLine(line));
      stderrBuffer.flush().forEach((line) => this.emitConsole(line));
      const wasTracked = this.process === child;
      this.cleanup(child);
      if (wasTracked) {
        this.emitConsole(`[Hypervisor] Process exited with code ${code}`);
        if (!this.stopRequested) this.scheduleCrashRestart();
      }
    });
  }

  /** Idempotent: safe to call from both `error` and `close` handlers. */
  private cleanup(child: ChildProcessWithoutNullStreams): void {
    if (this.process !== child) return;

    this.process = null;
    this.stopMetrics();
    this.stopPositionPolling();
    this.stopRestartSchedule();
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.isBridgeConnected = false;
    this.lastBridgeMetrics = undefined;
    this.players.clear();
    this.emit('players', []);
    this.setStatus('OFFLINE');
  }

  private handleStdoutLine(line: string): void {
    if (this.consumeQueryResponse(line)) return;

    this.emitConsole(line);

    const parsed = this.driver?.parseLogLine(line);
    if (!parsed) return;

    if (this.status === 'STARTING' && parsed.isReady) {
      this.crashAttempts = 0;
      this.setStatus('ONLINE');
      this.startPositionPolling();
      return;
    }

    if (parsed.playerJoin) {
      this.players.set(parsed.playerJoin.username, {
        username: parsed.playerJoin.username,
        // Unknown until the game reports it (log line, position query or bridge).
        dimension: parsed.playerJoin.dimension ?? '',
        x: parsed.playerJoin.x ?? 0,
        y: parsed.playerJoin.y ?? 64,
        z: parsed.playerJoin.z ?? 0
      });
      this.emitPlayers();
      return;
    }

    if (parsed.playerLeave) {
      if (this.players.delete(parsed.playerLeave)) {
        this.emitPlayers();
      }
    }
  }

  /** Returns true when the line answered one of our own position/dimension queries. */
  private consumeQueryResponse(line: string): boolean {
    if (this.driver?.consumeQueryResponse) {
      const result = this.driver.consumeQueryResponse(line, this.pendingQueries);
      if (result) {
        this.updatePlayer(result.username, result.patch as Partial<PlayerState>);
        return true;
      }
    }
    return false;
  }

  private updatePlayer(username: string, patch: Partial<PlayerState>): void {
    const current = this.players.get(username);
    if (!current) return;

    const next = { ...current, ...patch };
    const changed = (Object.keys(patch) as Array<keyof PlayerState>).some((key) => current[key] !== next[key]);
    this.players.set(username, next);
    if (changed) this.emitPlayers();
  }

  private pollPlayerPositions(): void {
    if (!this.process || this.status !== 'ONLINE' || this.isBridgeConnected) return;
    if (this.driver?.pollPlayerPositions) {
      this.driver.pollPlayerPositions(
        this.process.stdin,
        Array.from(this.players.keys()),
        this.pendingQueries
      );
    }
  }

  private startPositionPolling(): void {
    if (this.isBridgeConnected) return;
    this.stopPositionPolling();
    this.positionTimer = setInterval(() => this.pollPlayerPositions(), this.config.positionPollIntervalMs);
  }

  private stopPositionPolling(): void {
    if (this.positionTimer) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
    this.pendingQueries.clear();
  }

  private startMetrics(): void {
    this.stopMetrics();
    this.metricsTimer = setInterval(async () => {
      const pid = this.process?.pid;
      if (!pid) return;
      try {
        const stats = await pidusage(pid);
        this.emit('metrics', {
          cpu: Number(stats.cpu.toFixed(1)),
          ramMb: Math.round(stats.memory / BYTES_PER_MEGABYTE),
          maxRamMb: this.config.maxRamMb,
          uptime: stats.elapsed,
          tps: this.lastBridgeMetrics?.tps,
          mspt: this.lastBridgeMetrics?.mspt,
          loadedChunks: this.lastBridgeMetrics?.loadedChunks,
          entitiesCount: this.lastBridgeMetrics?.entitiesCount,
          bridgeConnected: this.isBridgeConnected,
          bridgeCapabilities: this.bridgeCapabilities
        });
      } catch {
        // The process may have exited between the pid check and sampling.
      }
    }, this.config.metricsIntervalMs);
  }

  private stopMetrics(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    pidusage.clear();
  }

  private setStatus(newStatus: ServerStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.emit('status', newStatus);
  }

  private emitPlayers(): void {
    this.emit('players', this.getPlayers());
  }

  private emitConsole(line: string): void {
    const formatted = `${line}${CONSOLE_LINE_ENDING}`;
    this.consoleBuffer.push(formatted);
    if (this.consoleBuffer.length > CONSOLE_BUFFER_LINES) {
      this.consoleBuffer.shift();
    }
    this.persistConsoleLine(line);
    this.emit('console', formatted);
  }

  /** Restarts after an unexpected exit, doubling the delay per attempt and giving up after a few. */
  private scheduleCrashRestart(): void {
    if (!this.config.autoRestart) return;
    if (this.crashAttempts >= MAX_CRASH_RESTARTS) {
      this.emitConsole(`[Hypervisor] Giving up after ${MAX_CRASH_RESTARTS} automatic restarts.`);
      return;
    }
    const base = this.config.restartBackoffMs ?? DEFAULT_RESTART_BACKOFF_MS;
    const delay = Math.min(base * 2 ** this.crashAttempts, MAX_RESTART_BACKOFF_MS);
    this.crashAttempts += 1;
    this.emitConsole(
      `[Hypervisor] Server crashed. Restarting in ${Math.round(delay / 1000)}s (attempt ${this.crashAttempts}/${MAX_CRASH_RESTARTS}).`
    );
    this.crashRestartTimer = setTimeout(() => {
      this.crashRestartTimer = null;
      if (!this.stopRequested && !this.process) this.start();
    }, delay);
  }

  private clearCrashRestart(): void {
    if (this.crashRestartTimer) {
      clearTimeout(this.crashRestartTimer);
      this.crashRestartTimer = null;
    }
  }

  private startRestartSchedule(): void {
    this.stopRestartSchedule();
    const hours = this.config.scheduledRestartHours;
    if (!hours || hours <= 0) return;
    this.scheduleTimer = setInterval(() => this.runScheduledRestart(), hours * MS_PER_HOUR);
    this.scheduleTimer.unref();
  }

  private stopRestartSchedule(): void {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    if (this.restartWarnTimer) {
      clearTimeout(this.restartWarnTimer);
      this.restartWarnTimer = null;
    }
  }

  /** Warns players (when the game declares a broadcast command), then restarts. */
  private runScheduledRestart(): void {
    if (this.status !== 'ONLINE' || this.restartWarnTimer) return;
    const warnMs = this.config.restartWarnMs ?? DEFAULT_RESTART_WARN_MS;
    const seconds = Math.round(warnMs / 1000);
    const broadcast = this.driver?.buildBroadcastCommand?.(`Server restarting in ${seconds} seconds`);
    if (broadcast && this.process) this.process.stdin.write(broadcast);
    this.emitConsole(`[Hypervisor] Scheduled restart in ${seconds}s.`);
    this.restartWarnTimer = setTimeout(() => {
      this.restartWarnTimer = null;
      if (this.status === 'ONLINE') this.restart();
    }, warnMs);
  }

  private fail(code: SupervisorErrorCode, message: string): void {
    this.emit('failure', { code, message });
    this.emitConsole(`[Hypervisor] ${message}`);
  }
}