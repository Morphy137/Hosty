import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { DaemonError } from '../errors';

export type ProvisionPhase = 'resolve' | 'download' | 'install' | 'configure';

export interface ProvisionHooks {
  signal?: AbortSignal;
  javaPath?: string;
  onLog: (message: string) => void;
  onPhase?: (phase: ProvisionPhase) => void;
  onBytes?: (received: number, total: number | null) => void;
}

const DEFAULT_HEADERS = { 'User-Agent': 'hosty (https://github.com/Morphy137/Hosty)' };

/** Streams a URL to disk, reporting byte progress and honouring cancellation. */
export async function downloadFile(url: string, dest: string, hooks: ProvisionHooks): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { headers: DEFAULT_HEADERS, signal: hooks.signal });
  } catch (err: unknown) {
    if (hooks.signal?.aborted) throw new DaemonError('INSTALL_CANCELLED', 'Installation cancelled.');
    const msg = err instanceof Error ? err.message : String(err);
    throw new DaemonError('UPSTREAM_ERROR', `Failed to reach download server: ${msg}`);
  }

  if (!response.ok || !response.body) {
    throw new DaemonError('UPSTREAM_ERROR', `Failed to download server file (${response.status} ${response.statusText})`);
  }

  const totalHeader = Number(response.headers.get('content-length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
  let received = 0;

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    hooks.onBytes?.(received, total);
  });

  try {
    await finished(source.pipe(fs.createWriteStream(dest)));
  } catch (err: unknown) {
    fs.rmSync(dest, { force: true });
    if (hooks.signal?.aborted) throw new DaemonError('INSTALL_CANCELLED', 'Installation cancelled.');
    throw err;
  }
}
