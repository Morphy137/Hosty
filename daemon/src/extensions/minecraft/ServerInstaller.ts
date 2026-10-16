import fs from 'fs';
import path from 'path';
import { DaemonError } from '../../errors';
import { downloadFile, type ExpectedChecksum, type ProvisionHooks } from '../../provisioning/download';
import { PropertiesParser } from './PropertiesParser';
import { runServerInstaller } from './JavaInstallerRunner';
import {
  FORGE_METADATA_URL,
  NEOFORGE_METADATA_URL,
  compareVersions,
  forgeBuilds,
  forgeInstallerUrl,
  forgeMinecraftVersions,
  latestForgeVersion,
  latestNeoForgeVersion,
  neoForgeBuilds,
  neoForgeInstallerUrl,
  neoForgeMinecraftVersions,
  parseMavenVersions
} from './ModLoaderCatalog';

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

export const AUTOMATIC_LOADERS: readonly LoaderType[] = ['paper', 'purpur', 'fabric', 'vanilla', 'forge', 'neoforge'];

export type { ProvisionHooks, ProvisionPhase } from '../../provisioning/download';

const USER_AGENT = 'mc-nexus/1.0.0 (contact@mc-nexus.local)';
const DEFAULT_HEADERS = { 'User-Agent': USER_AGENT };

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

const BUILD_PATTERN = /^[0-9a-zA-Z._+-]+$/;

const sha256Of = (hex: string | undefined): ExpectedChecksum | undefined =>
  hex ? { algorithm: 'sha256', hex } : undefined;

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
      if (loader === 'forge') {
        return forgeMinecraftVersions(await this.fetchMavenVersions(FORGE_METADATA_URL));
      }

      if (loader === 'neoforge') {
        return neoForgeMinecraftVersions(await this.fetchMavenVersions(NEOFORGE_METADATA_URL));
      }

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

  /**
   * Builds of a loader for one Minecraft version, newest first (what the user may pick instead of "latest").
   * Empty for loaders without separate builds (vanilla) or when the upstream cannot be reached.
   */
  public static async getBuilds(loader: LoaderType, mcVersion: string): Promise<string[]> {
    if (!this.isValidLoader(loader) || !AUTOMATIC_LOADERS.includes(loader)) return [];
    if (!BUILD_PATTERN.test(mcVersion)) return [];

    try {
      if (loader === 'forge') return forgeBuilds(await this.fetchMavenVersions(FORGE_METADATA_URL), mcVersion);
      if (loader === 'neoforge') return neoForgeBuilds(await this.fetchMavenVersions(NEOFORGE_METADATA_URL), mcVersion);

      if (loader === 'paper') {
        const res = await fetch(`https://fill.papermc.io/v3/projects/paper/versions/${mcVersion}/builds`, { headers: DEFAULT_HEADERS });
        if (!res.ok) return [];
        const builds = (await res.json()) as Array<{ id: number; channel?: string }>;
        const ids = builds.map((build) => build.id).sort((a, b) => b - a);
        return ids.map(String);
      }

      if (loader === 'purpur') {
        const res = await fetch(`https://api.purpurmc.org/v2/purpur/${mcVersion}`, { headers: DEFAULT_HEADERS });
        if (!res.ok) return [];
        const data = (await res.json()) as { builds?: { all?: string[] } };
        return (data.builds?.all ?? []).slice().sort((a, b) => Number(b) - Number(a));
      }

      if (loader === 'fabric') {
        const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`, { headers: DEFAULT_HEADERS });
        if (!res.ok) return [];
        const data = (await res.json()) as Array<{ loader: { version: string; stable: boolean } }>;
        const versions = data.map((entry) => entry.loader);
        return [...versions.filter((entry) => entry.stable), ...versions.filter((entry) => !entry.stable)].map((entry) => entry.version);
      }
    } catch {
      return [];
    }
    return [];
  }

  public static async provisionServer(
    workingDir: string,
    loader: LoaderType,
    mcVersion: string,
    hooks: ProvisionHooks,
    build?: string
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

    const { onLog, onPhase, signal } = hooks;

    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(workingDir, 'config'), { recursive: true });

    onPhase?.('resolve');
    onLog(`[Provisioner] Resolving ${loader.toUpperCase()} build for Minecraft ${mcVersion}...`);
    if (build && !BUILD_PATTERN.test(build)) throw new DaemonError('INVALID_VERSION', `Invalid build: "${build}".`);
    const download = await this.resolveDownload(loader, mcVersion, build || undefined);

    const isInstallerLoader = loader === 'forge' || loader === 'neoforge';
    const downloadTarget = path.join(workingDir, isInstallerLoader ? 'installer.jar' : 'server.jar');

    onPhase?.('download');
    onLog(`[Provisioner] Downloading ${isInstallerLoader ? 'installer' : 'server binary'}...`);
    await downloadFile(download.url, downloadTarget, hooks, download.checksum);

    if (isInstallerLoader) {
      onPhase?.('install');
      onLog('[Provisioner] Running the official installer (this can take a few minutes)...');
      try {
        await runServerInstaller({
          javaPath: hooks.javaPath || 'java',
          installerJar: downloadTarget,
          cwd: workingDir,
          signal,
          onLine: (line) => onLog(`[Installer] ${line}`)
        });
      } finally {
        fs.rmSync(downloadTarget, { force: true });
        fs.rmSync(path.join(workingDir, 'installer.jar.log'), { force: true });
      }
    }

    onPhase?.('configure');
    fs.writeFileSync(path.join(workingDir, 'eula.txt'), 'eula=true\n', 'utf-8');
    const propsPath = path.join(workingDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
      PropertiesParser.createDefaultProperties(propsPath);
    }
    onLog('[Provisioner] Server installed & eula.txt signed automatically.');
  }

  private static async fetchMavenVersions(url: string): Promise<string[]> {
    const res = await fetch(url, { headers: DEFAULT_HEADERS });
    if (!res.ok) {
      throw new DaemonError('UPSTREAM_ERROR', `Maven metadata responded with status ${res.status}`);
    }
    return parseMavenVersions(await res.text());
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
          return [...new Set(stableVersions.length > 0 ? stableVersions : allVersions)].sort((a, b) => compareVersions(b, a));
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
    return data.versions.slice().sort((a, b) => compareVersions(b, a));
  }

  private static async getFabricVersions(): Promise<string[]> {
    const res = await fetch('https://meta.fabricmc.net/v2/versions/game', { headers: DEFAULT_HEADERS });
    if (!res.ok) {
      throw new DaemonError('UPSTREAM_ERROR', `Fabric meta API responded with status ${res.status}`);
    }
    const data = (await res.json()) as Array<{ version: string; stable: boolean }>;
    return data.filter((v) => v.stable).map((v) => v.version);
  }

  private static async getVanillaVersions(): Promise<string[]> {
    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
      headers: DEFAULT_HEADERS
    });
    if (!res.ok) {
      throw new DaemonError('UPSTREAM_ERROR', `Mojang manifest API responded with status ${res.status}`);
    }
    const data = (await res.json()) as { versions: Array<{ id: string; type: string }> };
    return data.versions.filter((v) => v.type === 'release').map((v) => v.id);
  }

  /** Download URL of the server (or installer) and, when the source publishes one, its checksum. */
  private static async resolveDownload(
    loader: LoaderType,
    mcVersion: string,
    build?: string
  ): Promise<{ url: string; checksum?: ExpectedChecksum }> {
    if (loader === 'forge') {
      const all = await this.fetchMavenVersions(FORGE_METADATA_URL);
      const version = build ? (all.includes(`${mcVersion}-${build}`) ? `${mcVersion}-${build}` : null) : latestForgeVersion(all, mcVersion);
      if (!version) throw new DaemonError('INVALID_VERSION', `No Forge build found for Minecraft ${mcVersion}`);
      return { url: forgeInstallerUrl(version) };
    }

    if (loader === 'neoforge') {
      const all = await this.fetchMavenVersions(NEOFORGE_METADATA_URL);
      const version = build ? (neoForgeBuilds(all, mcVersion).includes(build) ? build : null) : latestNeoForgeVersion(all, mcVersion);
      if (!version) throw new DaemonError('INVALID_VERSION', `No NeoForge build found for Minecraft ${mcVersion}`);
      return { url: neoForgeInstallerUrl(version) };
    }

    if (loader === 'paper') {
      try {
        // Paper Fill v3: the chosen build, or the latest one
        const res = await fetch(`https://fill.papermc.io/v3/projects/paper/versions/${mcVersion}/builds/${build ?? 'latest'}`, {
          headers: DEFAULT_HEADERS
        });
        if (res.ok) {
          const data = (await res.json()) as {
            downloads?: { 'server:default'?: { url?: string; checksums?: { sha256?: string } } };
          };
          const server = data.downloads?.['server:default'];
          if (server?.url) {
            return { url: server.url, checksum: sha256Of(server.checksums?.sha256) };
          }
        }
      } catch {
        // Fallback to v2 builds
      }

      if (build) throw new DaemonError('INVALID_VERSION', `Paper build ${build} was not found for Minecraft ${mcVersion}`);
      const v2Res = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`, {
        headers: DEFAULT_HEADERS
      });
      if (!v2Res.ok) {
        throw new DaemonError('UPSTREAM_ERROR', `No Paper builds found for Minecraft ${mcVersion}`);
      }
      const v2Data = (await v2Res.json()) as {
        builds: Array<{ build: number; downloads: { application: { name: string; sha256?: string } } }>;
      };
      if (!v2Data.builds || v2Data.builds.length === 0) {
        throw new DaemonError('UPSTREAM_ERROR', `No Paper builds found for Minecraft ${mcVersion}`);
      }
      const latest = v2Data.builds[v2Data.builds.length - 1];
      const fileName = latest.downloads.application.name;
      return {
        url: `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latest.build}/downloads/${fileName}`,
        checksum: sha256Of(latest.downloads.application.sha256)
      };
    }

    if (loader === 'purpur') {
      return { url: `https://api.purpurmc.org/v2/purpur/${mcVersion}/${build ?? 'latest'}/download` };
    }

    if (loader === 'fabric') {
      const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader', { headers: DEFAULT_HEADERS });
      if (!loaderRes.ok) throw new DaemonError('UPSTREAM_ERROR', 'Failed to fetch Fabric loader metadata');
      const loaders = (await loaderRes.json()) as Array<{ version: string }>;

      const installerRes = await fetch('https://meta.fabricmc.net/v2/versions/installer', { headers: DEFAULT_HEADERS });
      if (!installerRes.ok) throw new DaemonError('UPSTREAM_ERROR', 'Failed to fetch Fabric installer metadata');
      const installers = (await installerRes.json()) as Array<{ version: string }>;

      const loaderVersion = build ?? loaders[0]?.version;
      if (!loaderVersion || !installers[0]) {
        throw new DaemonError('UPSTREAM_ERROR', 'Fabric loader or installer version not found');
      }

      return {
        url: `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installers[0].version}/server/jar`
      };
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
      downloads: { server: { url: string; sha1?: string } };
    };
    const server = versionData.downloads.server;
    return { url: server.url, checksum: server.sha1 ? { algorithm: 'sha1', hex: server.sha1 } : undefined };
  }
}