import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProvisionRunner, installDownload } from '../src/provisioning/InstallProviders';
import { validateManifest } from '../src/core/gamepacks/manifest';

let dir: string;
const hooks = { onLog: () => undefined };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-install-provider-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const stubFetch = (body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

describe('download provider', () => {
  it('downloads into the instance folder and verifies the checksum', async () => {
    stubFetch('server-binary');
    const target = await installDownload(
      { type: 'download', url: 'https://example.com/files/game-server.bin', sha256: sha256('server-binary') },
      dir,
      hooks
    );
    expect(path.basename(target)).toBe('game-server.bin');
    expect(fs.readFileSync(target, 'utf-8')).toBe('server-binary');
    expect(fs.existsSync(`${target}.part`)).toBe(false);
  });

  it('rejects a checksum mismatch without leaving files behind', async () => {
    stubFetch('tampered');
    await expect(
      installDownload({ type: 'download', url: 'https://example.com/a.bin', sha256: sha256('expected') }, dir, hooks)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses plain http and unsafe file names', async () => {
    await expect(installDownload({ type: 'download', url: 'http://example.com/a.bin' }, dir, hooks)).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD'
    });
    await expect(
      installDownload({ type: 'download', url: 'https://example.com/a.bin', filename: '../escape.bin' }, dir, hooks)
    ).rejects.toMatchObject({ code: 'INVALID_FILENAME' });
  });
});

describe('buildProvisionRunner', () => {
  const ctx = { instanceDir: '/tmp/x', toolsDir: '/tmp/tools' };

  it('returns null when a game declares no installation step', () => {
    expect(buildProvisionRunner(undefined, ctx)).toBeNull();
    expect(buildProvisionRunner({ type: 'none' }, ctx)).toBeNull();
  });

  it('maps steamcmd and download specs to runners', () => {
    expect(buildProvisionRunner({ type: 'steamcmd', appId: 1 }, { ...ctx, branch: 'unstable' })).toMatchObject({
      provider: 'steamcmd',
      version: 'unstable'
    });
    expect(buildProvisionRunner({ type: 'download', url: 'https://example.com/s.zip' }, ctx)).toMatchObject({
      provider: 'download',
      version: 's.zip'
    });
  });

  it('validates download specs in manifests', () => {
    const base = {
      apiVersion: 1,
      id: 'dl-game',
      name: 'DL',
      version: '1.0.0',
      defaults: { port: 1000, maxPlayers: 4 },
      launch: { executable: 'run' }
    };
    expect(validateManifest({ ...base, provision: { type: 'download', url: 'https://x.io/a' } }).ok).toBe(true);
    expect(validateManifest({ ...base, provision: { type: 'download', url: 'http://x.io/a' } }).ok).toBe(false);
    expect(validateManifest({ ...base, provision: { type: 'download', url: 'https://x.io/a', sha256: 'abc' } }).ok).toBe(false);
  });
});
