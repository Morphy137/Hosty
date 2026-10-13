import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import pidusage from 'pidusage';
import path from 'path';

export interface ServerConfig {
  id: string;
  workingDir: string;
  jarFile: string;
  minRamMb: number;
  maxRamMb: number;
}

export interface PlayerState {
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export class ProcessSupervisor extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private players: Map<string, PlayerState> = new Map();
  private status: 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING' = 'OFFLINE';

  constructor(private config: ServerConfig) {
    super();
  }

  public start(): void {
    if (this.process) return;

    this.setStatus('STARTING');
    const args = [
      `-Xms${this.config.minRamMb}M`,
      `-Xmx${this.config.maxRamMb}M`,
      '-XX:+UseG1GC',
      '-jar',
      this.config.jarFile,
      'nogui'
    ];

    this.process = spawn('java', args, {
      cwd: path.resolve(this.config.workingDir),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      this.emit('console', line);
      this.parseLogLine(line);
    });

    this.process.stderr.on('data', (data: Buffer) => {
      this.emit('console', data.toString());
    });

    this.process.on('close', (code) => {
      this.stopMetrics();
      this.process = null;
      this.players.clear();
      this.emit('players', []);
      this.setStatus('OFFLINE');
      this.emit('console', `[Hypervisor] Process exited with code ${code}\r\n`);
    });

    this.startMetrics();
  }

  public sendCommand(command: string): void {
    if (this.process && this.status === 'ONLINE') {
      this.process.stdin.write(`${command}\n`);
    }
  }

  public stop(): void {
    if (!this.process) return;
    this.setStatus('STOPPING');
    this.process.stdin.write('stop\n');
  }

  public kill(): void {
    if (!this.process) return;
    this.process.kill('SIGKILL');
  }

  private setStatus(newStatus: typeof this.status): void {
    this.status = newStatus;
    this.emit('status', this.status);
  }

  // Regex engine to extract server readiness and player telemetry directly from stdout
  private parseLogLine(line: string): void {
    if (line.includes('Done (') && line.includes('! For help, type "help"')) {
      this.setStatus('ONLINE');
    }

    // Match login pattern: username[/ip:port] logged in with entity id X at ([world]x, y, z)
    const joinMatch = line.match(/:\s([a-zA-Z0-9_]{3,16})\[\/.*\] logged in with entity id \d+ at \(\[?([a-zA-Z0-9_-]+)?\]?(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
    if (joinMatch) {
      const [, username, dimension = 'overworld', x, y, z] = joinMatch;
      this.players.set(username, {
        username,
        dimension,
        x: Math.round(parseFloat(x)),
        y: Math.round(parseFloat(y)),
        z: Math.round(parseFloat(z))
      });
      this.emit('players', Array.from(this.players.values()));
    }

    // Match disconnect pattern
    const leaveMatch = line.match(/:\s([a-zA-Z0-9_]{3,16}) left the game/);
    if (leaveMatch) {
      this.players.delete(leaveMatch[1]);
      this.emit('players', Array.from(this.players.values()));
    }
  }

  private startMetrics(): void {
    this.metricsInterval = setInterval(async () => {
      if (!this.process || !this.process.pid) return;
      try {
        const stats = await pidusage(this.process.pid);
        this.emit('metrics', {
          cpu: Number(stats.cpu.toFixed(1)),
          ramMb: Math.round(stats.memory / 1024 / 1024),
          maxRamMb: this.config.maxRamMb,
          uptime: stats.elapsed
        });
      } catch {
        // Process might be closing
      }
    }, 1500);
  }

  private stopMetrics(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}