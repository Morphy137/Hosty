import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';
import { DaemonError } from '../errors';
import { ServerInstaller, type ProvisionHooks } from './ServerInstaller';

const STEAMCMD_URL_WINDOWS = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
const STEAMCMD_URL_LINUX = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

export interface SteamCmdInstallOptions {
  appId: number;
  /** Optional beta branch name (e.g. `unstable`); omitted for the public branch. */
  branch?: string;
  installDir: string;
  /** Where SteamCMD itself is stored; shared by all installs. */
  toolsDir: string;
}

/** Arguments for an anonymous `app_update`. Exported for tests. */
export function buildSteamCmdArgs(options: Pick<SteamCmdInstallOptions, 'appId' | 'branch' | 'installDir'>): string[] {
  const update = ['+app_update', String(options.appId)];
  if (options.branch && options.branch !== 'stable') update.push('-beta', options.branch);
  update.push('validate');
  return ['+force_install_dir', options.installDir, '+login', 'anonymous', ...update, '+quit'];
}

async function ensureSteamCmd(toolsDir: string, hooks: ProvisionHooks): Promise<string> {
  const isWindows = process.platform === 'win32';
  const executable = path.join(toolsDir, isWindows ? 'steamcmd.exe' : 'steamcmd.sh');
  if (fs.existsSync(executable)) return executable;

  if (process.platform === 'darwin') {
    throw new DaemonError('INVALID_PAYLOAD', 'Automatic SteamCMD setup is not available on macOS yet.');
  }

  fs.mkdirSync(toolsDir, { recursive: true });
  hooks.onLog('[Provisioner] Downloading SteamCMD...');
  const archive = path.join(toolsDir, isWindows ? 'steamcmd.zip' : 'steamcmd.tar.gz');
  await ServerInstaller.downloadFile(isWindows ? STEAMCMD_URL_WINDOWS : STEAMCMD_URL_LINUX, archive, hooks);

  if (isWindows) {
    new AdmZip(archive).extractAllTo(toolsDir, true);
  } else {
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', archive, '-C', toolsDir]);
      tar.on('error', reject);
      tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`))));
    });
  }
  fs.rmSync(archive, { force: true });
  return executable;
}

/** Installs or updates a Steam dedicated server into `installDir` using an anonymous login. */
export async function installWithSteamCmd(options: SteamCmdInstallOptions, hooks: ProvisionHooks): Promise<void> {
  hooks.onPhase?.('download');
  const steamcmd = await ensureSteamCmd(options.toolsDir, hooks);

  fs.mkdirSync(options.installDir, { recursive: true });
  hooks.onPhase?.('install');
  hooks.onLog(`[Provisioner] Installing Steam app ${options.appId} (this can take a long time)...`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(steamcmd, buildSteamCmdArgs(options), { cwd: options.toolsDir });

    const forward = (stream: NodeJS.ReadableStream) => {
      let pending = '';
      stream.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf-8');
        const lines = pending.split(/\r?\n|\r/);
        pending = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) hooks.onLog(`[SteamCMD] ${line}`);
      });
    };
    forward(child.stdout);
    forward(child.stderr);

    hooks.signal?.addEventListener(
      'abort',
      () => {
        child.kill('SIGKILL');
        reject(new DaemonError('INSTALL_CANCELLED', 'Installation cancelled.'));
      },
      { once: true }
    );

    child.on('error', (error) => reject(new DaemonError('INTERNAL_ERROR', `Could not run SteamCMD: ${error.message}`)));
    child.on('close', (code) => {
      if (hooks.signal?.aborted) return;
      // SteamCMD exits with 7 after its first self-update on some systems; a rerun finishes the install.
      if (code === 0) resolve();
      else reject(new DaemonError('INTERNAL_ERROR', `SteamCMD exited with code ${code}.`));
    });
  });

  hooks.onPhase?.('configure');
}
