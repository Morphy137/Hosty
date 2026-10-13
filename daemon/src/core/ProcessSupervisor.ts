import { spawn as nodeSpawn, ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import pidusage from 'pidusage';
import { LineBuffer } from './LineBuffer';
import {
  isServerReadyLine,
  parseDimensionResponse,
  parsePlayerJoin,
  parsePlayerLeave,
  parsePositionResponse
} from './LogLineParser';

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
}

export interface PlayerState {
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export interface ServerMetrics {
  cpu: number;
  ramMb: number;
  maxRamMb: number;
  uptime: number;
}

export type ServerStatus = 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING';

export type SupervisorErrorCode =
  | 'JAR_MISSING'
  | 'JAVA_NOT_FOUND'
  | 'PROCESS_ERROR'
  | 'SERVER_NOT_ONLINE'
  | 'ALREADY_RUNNING';

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
const JVM_FLAGS = ['-XX:+UseG1GC'];

export class ProcessSupervisor extends EventEmitter<ProcessSupervisorEvents> {
  private process: ChildProcessWithoutNullStreams | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private positionTimer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;
  private readonly players = new Map<string, PlayerState>();
  /** Outstanding `/data get` queries issued by the poller; their output is hidden from the console. */
  private readonly pendingQueries = new Set<string>();
  private status: ServerStatus = 'OFFLINE';

  constructor(
    private readonly config: ServerConfig,
    private readonly spawnProcess: SpawnFunction = nodeSpawn
  ) {
    super();
  }

  public getStatus(): ServerStatus {
    return this.status;
  }

  public getPlayers(): PlayerState[] {
    return Array.from(this.players.values());
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

    const workingDir = path.resolve(this.config.workingDir);
    const jarPath = path.join(workingDir, this.config.jarFile);
    if (!fs.existsSync(jarPath)) {
      this.fail('JAR_MISSING', `Server jar not found at ${jarPath}. Provision a server first.`);
      return;
    }

    this.setStatus('STARTING');
    const child = this.spawnProcess(this.config.javaPath, this.buildJvmArgs(), {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.process = child;
    this.attachProcessListeners(child);
    this.startMetrics();
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
    if (!this.process || this.status === 'STOPPING') return;

    this.setStatus('STOPPING');
    this.stopPositionPolling();
    this.process.stdin.write('stop\n');
    this.stopTimer = setTimeout(() => {
      this.emitConsole(`[Hypervisor] Graceful stop timed out after ${this.config.stopTimeoutMs} ms, killing process.`);
      this.kill();
    }, this.config.stopTimeoutMs);
  }

  public kill(): void {
    if (!this.process) return;
    this.process.kill('SIGKILL');
  }

  private buildJvmArgs(): string[] {
    return [
      `-Xms${this.config.minRamMb}M`,
      `-Xmx${this.config.maxRamMb}M`,
      ...JVM_FLAGS,
      '-jar',
      this.config.jarFile,
      'nogui'
    ];
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
        this.fail('JAVA_NOT_FOUND', `Java executable "${this.config.javaPath}" was not found. Install Java or set MC_NEXUS_JAVA_PATH.`);
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
      if (wasTracked) this.emitConsole(`[Hypervisor] Process exited with code ${code}`);
    });
  }

  /** Idempotent: safe to call from both `error` and `close` handlers. */
  private cleanup(child: ChildProcessWithoutNullStreams): void {
    if (this.process !== child) return;

    this.process = null;
    this.stopMetrics();
    this.stopPositionPolling();
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.players.clear();
    this.emit('players', []);
    this.setStatus('OFFLINE');
  }

  private handleStdoutLine(line: string): void {
    if (this.consumeQueryResponse(line)) return;

    this.emitConsole(line);

    if (this.status === 'STARTING' && isServerReadyLine(line)) {
      this.setStatus('ONLINE');
      this.startPositionPolling();
      return;
    }

    const joined = parsePlayerJoin(line);
    if (joined) {
      this.players.set(joined.username, joined);
      this.emitPlayers();
      return;
    }

    const leftUsername = parsePlayerLeave(line);
    if (leftUsername && this.players.delete(leftUsername)) {
      this.emitPlayers();
    }
  }

  /** Returns true when the line answered one of our own position/dimension queries. */
  private consumeQueryResponse(line: string): boolean {
    const position = parsePositionResponse(line);
    if (position && this.pendingQueries.delete(this.queryKey(position.username, 'Pos'))) {
      this.updatePlayer(position.username, { x: position.x, y: position.y, z: position.z });
      return true;
    }

    const dimension = parseDimensionResponse(line);
    if (dimension && this.pendingQueries.delete(this.queryKey(dimension.username, 'Dimension'))) {
      this.updatePlayer(dimension.username, { dimension: dimension.dimension });
      return true;
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

  private queryKey(username: string, dataPath: 'Pos' | 'Dimension'): string {
    return `${username}:${dataPath}`;
  }

  private pollPlayerPositions(): void {
    if (!this.process || this.status !== 'ONLINE') return;

    // Drop unanswered queries (e.g. player left between polls) so they never leak.
    this.pendingQueries.clear();
    for (const username of this.players.keys()) {
      for (const dataPath of ['Pos', 'Dimension'] as const) {
        this.pendingQueries.add(this.queryKey(username, dataPath));
        this.process.stdin.write(`data get entity ${username} ${dataPath}\n`);
      }
    }
  }

  private startPositionPolling(): void {
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
          uptime: stats.elapsed
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
    this.emit('console', `${line}${CONSOLE_LINE_ENDING}`);
  }

  private fail(code: SupervisorErrorCode, message: string): void {
    this.emit('failure', { code, message });
    this.emitConsole(`[Hypervisor] ${message}`);
  }
}