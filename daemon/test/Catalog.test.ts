import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fetchCatalog, verifyCatalogSignature, type CatalogSource } from '../src/core/catalog/Catalog';
import { installFromCatalog, listCatalog } from '../src/core/catalog/CatalogService';
import { GameDriverRegistry } from '../src/core/drivers/GameDriverRegistry';

const BUILD_SCRIPT = path.resolve(__dirname, '../../catalog/scripts/build-catalog.mjs');
const BASE_URL = 'https://catalog.test';

const tempDir = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const keyPair = () => crypto.generateKeyPairSync('ed25519');
const publicPem = (key: crypto.KeyObject): string => key.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = (key: crypto.KeyObject): string => key.export({ type: 'pkcs8', format: 'pem' }).toString();

const manifest = (version: string, extra: Record<string, unknown> = {}) => ({
  apiVersion: 1,
  id: 'demo-game',
  name: 'Demo Game',
  version,
  author: { name: 'Ana', url: 'https://github.com/ana' },
  defaults: { port: 25000, maxPlayers: 8 },
  launch: { executable: 'server.exe' },
  ...extra
});

/** Publishes `packs` with the real build script and serves the output through a fake `fetch`. */
function publish(packs: Record<string, { files: Record<string, string> }>, signingKey: crypto.KeyObject) {
  const packsDir = tempDir('catalog-packs-');
  for (const [id, pack] of Object.entries(packs)) {
    for (const [file, content] of Object.entries(pack.files)) {
      fs.mkdirSync(path.dirname(path.join(packsDir, id, file)), { recursive: true });
      fs.writeFileSync(path.join(packsDir, id, file), content);
    }
  }
  const outDir = path.join(tempDir('catalog-out-'), 'site');
  execFileSync(process.execPath, [BUILD_SCRIPT, '--packs', packsDir, '--out', outDir, '--key', writeKey(signingKey)], { stdio: 'pipe' });

  const overrides = new Map<string, Buffer>();
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    const relative = decodeURIComponent(url.slice(BASE_URL.length + 1));
    const content = overrides.get(relative) ?? (fs.existsSync(path.join(outDir, relative)) ? fs.readFileSync(path.join(outDir, relative)) : null);
    return content ? new Response(new Uint8Array(content)) : new Response('missing', { status: 404 });
  }) as typeof fetch;
  return { outDir, overrides, fetchImpl };
}

const writeKey = (key: crypto.KeyObject): string => {
  const file = path.join(tempDir('catalog-key-'), 'signing.pem');
  fs.writeFileSync(file, privatePem(key));
  return file;
};

describe('catalog signature', () => {
  it('accepts only the exact bytes signed by the matching key', () => {
    const { publicKey, privateKey } = keyPair();
    const content = Buffer.from('{"packs":[]}');
    const signature = crypto.sign(null, content, privateKey).toString('base64');

    expect(verifyCatalogSignature(content, signature, publicPem(publicKey))).toBe(true);
    expect(verifyCatalogSignature(Buffer.from('{"packs":[1]}'), signature, publicPem(publicKey))).toBe(false);
    expect(verifyCatalogSignature(content, signature, publicPem(keyPair().publicKey))).toBe(false);
    expect(verifyCatalogSignature(content, 'not base64 !!', publicPem(publicKey))).toBe(false);
  });
});

describe('signed pack catalog', () => {
  const { publicKey, privateKey } = keyPair();
  let source: CatalogSource;
  let site: ReturnType<typeof publish>;

  beforeAll(() => {
    site = publish(
      {
        'demo-game': {
          files: {
            'hosty-game.json': JSON.stringify(manifest('1.2.0')),
            'driver.js': 'module.exports.createDriver = () => ({ buildStopCommand: () => "bye\\n" });',
            'icons/a.txt': 'icon'
          }
        }
      },
      privateKey
    );
    source = { baseUrl: BASE_URL, publicKey: publicPem(publicKey), fetchImpl: site.fetchImpl };
  });

  it('lists packs with their author, size and whether they are installed or outdated', async () => {
    const registry = new GameDriverRegistry();
    registry.loadPacks(tempDir('catalog-games-'));

    const [fresh] = await listCatalog(source, registry.getPackInfos());
    expect(fresh).toMatchObject({
      id: 'demo-game',
      version: '1.2.0',
      author: { name: 'Ana', url: 'https://github.com/ana' },
      hasCode: true,
      installedVersion: null,
      updateAvailable: false
    });
    expect(fresh.size).toBeGreaterThan(0);

    const installed = [{ id: 'demo-game', version: '1.0.0' }] as Parameters<typeof listCatalog>[1];
    expect((await listCatalog(source, installed))[0]).toMatchObject({ installedVersion: '1.0.0', updateAvailable: true });
  });

  it('installs a pack and approves its code because the signed hashes matched', async () => {
    const gamesDir = tempDir('catalog-games-');
    const registry = new GameDriverRegistry();
    registry.loadPacks(gamesDir);

    await installFromCatalog(source, 'demo-game', registry);

    expect(registry.hasDriver('demo-game')).toBe(true);
    expect(registry.getPackInfos()[0]).toMatchObject({ hasCode: true, trusted: true });
    expect(registry.getDriver('demo-game').buildStopCommand()).toBe('bye\n');
    expect(fs.existsSync(path.join(gamesDir, 'demo-game', 'icons', 'a.txt'))).toBe(true);
  });

  it('refuses a catalog whose index was altered after signing', async () => {
    const tampered = new Map(site.overrides);
    const index = JSON.parse(fs.readFileSync(path.join(site.outDir, 'index.json'), 'utf-8'));
    index.packs[0].files[0].sha256 = '0'.repeat(64);
    site.overrides.set('index.json', Buffer.from(JSON.stringify(index)));

    await expect(fetchCatalog(source)).rejects.toThrow(/signature/);

    site.overrides.clear();
    tampered.forEach((value, key) => site.overrides.set(key, value));
  });

  it('refuses a catalog signed with a different key', async () => {
    const other = { ...source, publicKey: publicPem(keyPair().publicKey) };
    await expect(fetchCatalog(other)).rejects.toThrow(/signature/);
  });

  it('discards a pack whose downloaded file does not match the signed hash', async () => {
    const registry = new GameDriverRegistry();
    registry.loadPacks(tempDir('catalog-games-'));
    site.overrides.set('packs/demo-game/driver.js', Buffer.from('require("child_process").exec("evil")'));
    try {
      await expect(installFromCatalog(source, 'demo-game', registry)).rejects.toThrow(/does not match/);
      expect(registry.hasDriver('demo-game')).toBe(false);
    } finally {
      site.overrides.delete('packs/demo-game/driver.js');
    }
  });

  it('rejects packs that are not in the catalog and paths that escape the pack folder', async () => {
    const registry = new GameDriverRegistry();
    registry.loadPacks(tempDir('catalog-games-'));
    await expect(installFromCatalog(source, 'nope-game', registry)).rejects.toThrow(/not in the game catalog/);

    const evil = Buffer.from(
      JSON.stringify({
        apiVersion: 1,
        generatedAt: '',
        packs: [{ id: 'evil-game', name: 'E', version: '1.0.0', files: [{ path: '../../escape.txt', sha256: '0'.repeat(64), size: 1 }] }]
      })
    );
    site.overrides.set('index.json', evil);
    site.overrides.set('index.json.sig', Buffer.from(crypto.sign(null, evil, privateKey).toString('base64')));
    try {
      await expect(fetchCatalog(source)).rejects.toThrow(/invalid pack/);
    } finally {
      site.overrides.delete('index.json');
      site.overrides.delete('index.json.sig');
    }
  });
});
