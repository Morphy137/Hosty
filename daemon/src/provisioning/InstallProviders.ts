import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';
import type { GameDriverSummary } from '../core/drivers/IGameDriver';
import { downloadFile, type ProvisionHooks } from './download';
import { installWithSteamCmd } from './SteamCmd';

export type ProvisionSpec = NonNullable<GameDriverSummary['provision']>;

export interface ProvisionRunnerContext {
  instanceDir: string;
  /** Where shared tools (SteamCMD) are kept. */
  toolsDir: string;
  /** Game-specific channel / branch chosen by the user (e.g. a Steam beta branch). */
  branch?: string;
}

export interface ProvisionRunner {
  /** Short provider id, also shown as the job's "loader". */
  provider: string;
  version: string;
  run: (hooks: ProvisionHooks) => Promise<void>;
}

const SAFE_FILENAME = /^[A-Za-z0-9._-][A-Za-z0-9._ -]{0,127}$/;

/** Downloads one file declared by the game (`download` provider), verifying `sha256` when present. */
export async function installDownload(
  spec: Extract<ProvisionSpec, { type: 'download' }>,
  instanceDir: string,
  hooks: ProvisionHooks
): Promise<string> {
  let url: URL;
  try {
    url = new URL(spec.url);
  } catch {
    throw new DaemonError('INVALID_PAYLOAD', `Invalid download URL: ${spec.url}`);
  }
  if (url.protocol !== 'https:') {
    throw new DaemonError('INVALID_PAYLOAD', 'Only https downloads are allowed.');
  }

  const filename = spec.filename ?? decodeURIComponent(path.basename(url.pathname));
  if (!SAFE_FILENAME.test(filename) || filename.includes('..')) {
    throw new DaemonError('INVALID_FILENAME', `Unsafe download file name: ${filename}`);
  }

  fs.mkdirSync(instanceDir, { recursive: true });
  const target = path.join(instanceDir, filename);
  const temp = `${target}.part`;

  hooks.onPhase?.('download');
  hooks.onLog(`[Provisioner] Downloading ${filename}...`);
  try {
    await downloadFile(url.toString(), temp, hooks);
    if (spec.sha256) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(temp)).digest('hex');
      if (actual.toLowerCase() !== spec.sha256.toLowerCase()) {
        throw new DaemonError('UPSTREAM_ERROR', 'The downloaded file failed its integrity check.');
      }
    }
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }

  hooks.onPhase?.('configure');
  hooks.onLog(`[Provisioner] ${filename} installed.`);
  return target;
}

/**
 * Maps a game's declared `provision` spec to something runnable. Returns null for games that need no
 * server-side installation step (their binaries are provided by the user or a client-side flow).
 */
export function buildProvisionRunner(spec: ProvisionSpec | undefined, ctx: ProvisionRunnerContext): ProvisionRunner | null {
  if (!spec || spec.type === 'none') return null;

  if (spec.type === 'steamcmd') {
    return {
      provider: 'steamcmd',
      version: ctx.branch ?? 'stable',
      run: (hooks) =>
        installWithSteamCmd(
          { appId: spec.appId, branch: ctx.branch, installDir: ctx.instanceDir, toolsDir: ctx.toolsDir },
          hooks
        )
    };
  }

  return {
    provider: 'download',
    version: spec.filename ?? path.basename(new URL(spec.url).pathname),
    run: async (hooks) => {
      await installDownload(spec, ctx.instanceDir, hooks);
    }
  };
}
