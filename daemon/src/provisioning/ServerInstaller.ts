import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

export type LoaderType = 'paper' | 'fabric' | 'vanilla';

export class ServerInstaller {
  public static async getVersions(loader: LoaderType): Promise<string[]> {
    if (loader === 'paper') {
      const res = await fetch('https://api.papermc.io/v2/projects/paper');
      const data = (await res.json()) as { versions: string[] };
      return data.versions.reverse().slice(0, 15);
    }

    if (loader === 'fabric') {
      const res = await fetch('https://meta.fabricmc.net/v2/versions/game');
      const data = (await res.json()) as Array<{ version: string; stable: boolean }>;
      return data.filter((v) => v.stable).map((v) => v.version).slice(0, 15);
    }

    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const data = (await res.json()) as { versions: Array<{ id: string; type: string }> };
    return data.versions.filter((v) => v.type === 'release').map((v) => v.id).slice(0, 15);
  }

  public static async provisionServer(
    workingDir: string,
    loader: LoaderType,
    mcVersion: string,
    onProgress: (msg: string) => void
  ): Promise<void> {
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(path.join(workingDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(workingDir, 'config'), { recursive: true });

    onProgress(`[Provisioner] Resolving ${loader.toUpperCase()} build for Minecraft ${mcVersion}...`);
    const downloadUrl = await this.resolveDownloadUrl(loader, mcVersion);

    onProgress(`[Provisioner] Downloading binary from ${downloadUrl}...`);
    const response = await fetch(downloadUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download server jar (${response.statusText})`);
    }

    const jarDest = path.join(workingDir, 'server.jar');
    const fileStream = fs.createWriteStream(jarDest);
    await finished(Readable.fromWeb(response.body as any).pipe(fileStream));

    fs.writeFileSync(path.join(workingDir, 'eula.txt'), 'eula=true\n', 'utf-8');
    onProgress(`[Provisioner] server.jar installed & eula.txt signed automatically.`);
  }

  private static async resolveDownloadUrl(loader: LoaderType, mcVersion: string): Promise<string> {
    if (loader === 'paper') {
      const res = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`);
      const data = (await res.json()) as {
        builds: Array<{ build: number; downloads: { application: { name: string } } }>;
      };
      const latest = data.builds[data.builds.length - 1];
      const fileName = latest.downloads.application.name;
      return `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latest.build}/downloads/${fileName}`;
    }

    if (loader === 'fabric') {
      const loaderRes = await fetch('https://meta.fabricmc.net/v2/versions/loader');
      const loaders = (await loaderRes.json()) as Array<{ version: string }>;
      const installerRes = await fetch('https://meta.fabricmc.net/v2/versions/installer');
      const installers = (await installerRes.json()) as Array<{ version: string }>;

      return `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaders[0].version}/${installers[0].version}/server/jar`;
    }

    const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const manifest = (await manifestRes.json()) as {
      versions: Array<{ id: string; url: string }>;
    };
    const target = manifest.versions.find((v) => v.id === mcVersion);
    if (!target) throw new Error('Minecraft version not found');

    const versionRes = await fetch(target.url);
    const versionData = (await versionRes.json()) as {
      downloads: { server: { url: string } };
    };
    return versionData.downloads.server.url;
  }
}