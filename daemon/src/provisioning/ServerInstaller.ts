import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { DaemonError } from '../errors';
import { PropertiesParser } from '../parsers/PropertiesParser';

export const VALID_LOADERS = [
  'paper',
  'purpur',
  'fabric',
  'vanilla',
  'forge',
  'neoforge',
  'spigot'
] as const;
export type LoaderType = (typeof VALID_LOADERS)[number];

export const AUTOMATIC_LOADERS: readonly LoaderType[] = ['paper', 'purpur', 'fabric', 'vanilla'];

const USER_AGENT = 'mc-nexus/1.0.0 (contact@mc-nexus.local)';
const DEFAULT_HEADERS = { 'User-Agent': USER_AGENT };
const MAX_VERSIONS = 15;

export const DEFAULT_MINECRAFT_VERSIONS: readonly string[] = [
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.2',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.16.5'
];

export class ServerInstaller {
  public static isValidLoader(value: unknown): value is LoaderType {
    return typeof value === 'string' && (VALID_LOADERS as readonly string[]).includes(value);
  }

  public static async getVersions(loader: LoaderType): Promise<string[]> {
    if (!this.isValidLoader(loader)) {
      throw new DaemonError('INVALID_LOADER', `Invalid loader: "${loader}". Expected one of: ${VALID_LOADERS.join(', ')}`);
    }

    if (!AUTOMATIC_LOADERS.includes(loader)) {
      // Manual loaders (Forge, NeoForge, Spigot) rely on external installer/manual jar upload
      return [];
    }

    try {
      if (loader === 'paper') {
        return await this.getPaperVersions();
      }

      if (loader === 'purpur') {
        return await this.getPurpurVersions();
      }

      if (loader === 'fabric') {
        return await this.getFabricVersions();
      }

      return await this.getVanillaVersions();
    } catch {
      return [...DEFAULT_MINECRAFT_VERSIONS];
    }
  }

  public static async provisionServer(
    workingDir: string,
    loader: LoaderType,
    mcVersion: string,
    onProgress: (msg: string) => void
  ): Promise<void> {
    if (!this.isValidLoader(loader)) {
      throw new DaemonError('INVALID_LOADER', `Invalid loader: "${loader}".`);
    }

    if (!AUTOMATIC_LOADERS.includes(loader)) {
      throw new DaemonError(
        'INVALID_LOADER',
        `Loader "${loader}" requires a manual server jar attachment/upload.`
      );
    }

    if (!mcVersion || typeof mcVersion !== 'string' || !/^[0-9a-zA-Z._-]+$/.test(mcVersion)) {
      throw new DaemonError('INVALID_VERSION', `Invalid Minecraft version: "${mcVersion}".`);
    }

    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(workingDir, 'config'), { recursive: true });

    onProgress(`[Provisioner] Resolving ${loader.toUpperCase()} build for Minecraft ${mcVersion}...`);
    const downloadUrl = await this.resolveDownloadUrl(loader, mcVersion);

    onProgress(`[Provisioner] Downloading server binary...`);
    let response: Response;
    try {
      response = await fetch(downloadUrl, { headers: DEFAULT_HEADERS });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DaemonError('UPSTREAM_ERROR', `Failed to reach download server: ${msg}`);
    }

    if (!response.ok || !response.body) {
      throw new DaemonError(
        'UPSTREAM_ERROR',
        `Failed to download server jar (${response.status} ${response.statusText})`
      );
    }

    const jarDest = path.join(workingDir, 'server.jar');
    const fileStream = fs.createWriteStream(jarDest);
    await finished(Readable.fromWeb(response.body as any).pipe(fileStream));

    fs.writeFileSync(path.join(workingDir, 'eula.txt'), 'eula=true\n', 'utf-8');
    const propsPath = path.join(workingDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      PropertiesParser.createDefaultProperties(propsPath);
    }
    onProgress(`[Provisioner] server.jar installed & eula.txt signed automatically.`);
  }

  private static async getPaperVersions(): Promise<string[]> {
    try {
      // Primary: Paper Fill v3
      const res = await fetch('https://fill.papermc.io/v3/projects/paper', { headers: DEFAULT_HEADERS });
      if (res.ok) {
        const data = (await res.json()) as { versions?: Record<string, string[]> };
        if (data.versions) {
          const allVersions = Object.values(data.versions).flat();
          // Filter out -rc and -pre for clean defaults
          const stableVersions = allVersions.filter((v) => !v.includes('-rc') && !v.includes('-pre'));
          return (stableVersions.length > 0 ? stableVersions : allVersions).slice(0, MAX_VERSIONS);
        }
      }
    } catch {
      // Fallback
    }

    return [...DEFAULT_MINECRAFT_VERSIONS];
  }

  private static async getPurpurVersions(): Promise<string[]> {
    const res = await fetch('https://api.purpurmc.org/v2/purpur', { headers: DEFAULT_HEADERS });
    if (!res.ok) {
      throw new DaemonError('UPSTREAM_ERROR', `Purpur API responded with status ${res.status}`);
    }
    const data = (await res.json()) as { versions: string[] };
    return data.versions.slice().reverse().slice(0, MAX_VERSIONS);
  }

  private static async getFabricVersions(): Promise<string[]> {
    const res = await fetch('https://meta.fabricmc.net/v2/versions/game', { headers: DEFAULT_HEADERS });
    if (!res.ok) {
      throw new DaemonError('UPSTREAM_ERROR', `Fabric meta API responded with status ${res.status}`);
    }
    const data = (await res.json()) as Array<{ version: string; stable: boolean }>;
    return data.filter((v) => v.stable).map((v) => v.version).slice(0, MAX_VERSIONS);
  }

  private static async getVanillaVersions(): Promise<string[]> {
    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
      headers: DEFAULT_HEADERS
    });
    if (!res.ok) {
      throw new DaemonError('UPSTREAM_ERROR', `Mojang manifest API responded with status ${res.status}`);
    }
    const data = (await res.json()) as { versions: Array<{ id: string; type: string }> };
    return data.versions.filter((v) => v.type === 'release').map((v) => v.id).slice(0, MAX_VERSIONS);
  }

  private static async resolveDownloadUrl(loader: LoaderType, mcVersion: string): Promise<string> {
    if (loader === 'paper') {
      try {
        // Paper Fill v3 latest build
        const res = await fetch(`https://fill.papermc.io/v3/projects/paper/versions/${mcVersion}/builds/latest`, {
          headers: DEFAULT_HEADERS
        });
        if (res.ok) {
          const data = (await res.json()) as { downloads?: { 'server:default'?: { url?: string } } };
          const directUrl = data.downloads?.['server:default']?.url;
          if (directUrl) return directUrl;
        }
      } catch {
        // Fallback to v2 builds
      }

      const v2Res = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`, {
        headers: DEFAULT_HEADERS
      });
      if (!v2Res.ok) {
        throw new DaemonError('UPSTREAM_ERROR', `No Paper builds found for Minecraft ${mcVersion}`);
      }
      const v2Data = (await v2Res.json()) as {
        builds: Array<{ build: number; downloads: { application: { name: string } } }>;
      };
      if (!v2Data.builds || v2Data.builds.length === 0) {
        throw new DaemonError('UPSTREAM_ERROR', `No Paper builds found for Minecraft ${mcVersion}`);
      }
      const latest = v2Data.builds[v2Data.builds.length - 1];
      const fileName = latest.downloads.application.name;
      return `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latest.build}/downloads/${fileName}`;
    }

    if (loader === 'purpur') {
      return `https://api.purpurmc.org/v2/purpur/${mcVersion}/latest/download`;
    }

    if (loader === 'fabric') {
      const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader', { headers: DEFAULT_HEADERS });
      if (!loaderRes.ok) throw new DaemonError('UPSTREAM_ERROR', 'Failed to fetch Fabric loader metadata');
      const loaders = (await loaderRes.json()) as Array<{ version: string }>;

      const installerRes = await fetch('https://meta.fabricmc.net/v2/versions/installer', { headers: DEFAULT_HEADERS });
      if (!installerRes.ok) throw new DaemonError('UPSTREAM_ERROR', 'Failed to fetch Fabric installer metadata');
      const installers = (await installerRes.json()) as Array<{ version: string }>;

      if (!loaders[0] || !installers[0]) {
        throw new DaemonError('UPSTREAM_ERROR', 'Fabric loader or installer version not found');
      }

      return `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaders[0].version}/${installers[0].version}/server/jar`;
    }

    const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
      headers: DEFAULT_HEADERS
    });
    if (!manifestRes.ok) throw new DaemonError('UPSTREAM_ERROR', 'Failed to fetch Mojang version manifest');
    const manifest = (await manifestRes.json()) as {
      versions: Array<{ id: string; url: string }>;
    };
    const target = manifest.versions.find((v) => v.id === mcVersion);
    if (!target) throw new DaemonError('INVALID_VERSION', `Minecraft version ${mcVersion} not found in official manifest`);

    const versionRes = await fetch(target.url, { headers: DEFAULT_HEADERS });
    if (!versionRes.ok) throw new DaemonError('UPSTREAM_ERROR', 'Failed to fetch Mojang version details');
    const versionData = (await versionRes.json()) as {
      downloads: { server: { url: string } };
    };
    return versionData.downloads.server.url;
  }
}