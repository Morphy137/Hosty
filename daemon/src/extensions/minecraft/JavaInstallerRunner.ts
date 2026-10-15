import { spawn } from 'child_process';
import { DaemonError } from '../../errors';

export interface JavaInstallerOptions {
  javaPath: string;
  installerJar: string;
  cwd: string;
  signal?: AbortSignal;
  onLine: (line: string) => void;
}

/** Runs `java -jar <installer> --installServer` inside the instance directory (Forge / NeoForge). */
export function runServerInstaller(options: JavaInstallerOptions): Promise<void> {
  const { javaPath, installerJar, cwd, signal, onLine } = options;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DaemonError('INSTALL_CANCELLED', 'Installation cancelled.'));
      return;
    }

    const child = spawn(javaPath || 'java', ['-jar', installerJar, '--installServer'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const pipeLines = (stream: NodeJS.ReadableStream) => {
      let pending = '';
      stream.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf-8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) onLine(line);
        }
      });
      stream.on('end', () => {
        if (pending.trim()) onLine(pending);
      });
    };
    pipeLines(child.stdout);
    pipeLines(child.stderr);

    const onAbort = () => {
      child.kill('SIGKILL');
      reject(new DaemonError('INSTALL_CANCELLED', 'Installation cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(
        new DaemonError(
          'INTERNAL_ERROR',
          `Could not run Java for the installer (${error.message}). Make sure Java is installed.`
        )
      );
    });

    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return;
      if (code === 0) {
        resolve();
      } else {
        reject(new DaemonError('INTERNAL_ERROR', `The server installer exited with code ${code}.`));
      }
    });
  });
}
