import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DaemonError } from '../errors';

export type ProvisionPhase = 'resolve' | 'download' | 'install' | 'configure';

export interface ProvisionHooks {
  signal?: AbortSignal;
  javaPath?: string;
  onLog: (message: string) => void;
  onPhase?: (phase: ProvisionPhase) => void;
  onBytes?: (received: number, total: number | null) => void;
}

/** Digest published by the download source; the file is rejected when it does not match. */
export interface ExpectedChecksum {
  algorithm: 'sha1' | 'sha256';
  hex: string;
}

const DEFAULT_HEADERS = { 'User-Agent': 'hosty (https://github.com/Morphy137/Hosty)' };
const PARTIAL_SUFFIX = '.part';

/**
 * Streams a URL to `<dest>.part`, reporting byte progress and honouring cancellation, and only replaces `dest`
 * once the download is complete (and matches `expected`). A failed or cancelled download leaves an existing
 * `dest` untouched.
 */
export async function downloadFile(
  url: string,
  dest: string,
  hooks: ProvisionHooks,
  expected?: ExpectedChecksum
): Promise<void> {
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
  const hash = expected ? crypto.createHash(expected.algorithm) : null;

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    hash?.update(chunk);
    hooks.onBytes?.(received, total);
  });

  const partial = `${dest}${PARTIAL_SUFFIX}`;
  try {
    // `pipeline` (unlike `pipe`) propagates a dropped connection, so a broken download fails instead of hanging.
    await pipeline(source, fs.createWriteStream(partial));
  } catch (err: unknown) {
    fs.rmSync(partial, { force: true });
    if (hooks.signal?.aborted) throw new DaemonError('INSTALL_CANCELLED', 'Installation cancelled.');
    throw err;
  }

  if (hash && expected && hash.digest('hex') !== expected.hex.toLowerCase()) {
    fs.rmSync(partial, { force: true });
    throw new DaemonError('UPSTREAM_ERROR', 'The downloaded file is corrupt (checksum mismatch). Try again.');
  }
  fs.renameSync(partial, dest);
}
