import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DaemonError } from '../errors';
import type { ModSourceSummary } from '../core/drivers/IGameDriver';
import { ModJarManager } from '../core/ModJarManager';
import { ServerInstaller } from './ServerInstaller';

const USER_AGENT = 'hosty/0.1 (https://github.com/Morphy137/Hosty)';
const SEARCH_PAGE_SIZE = 20;

export interface ModSearchHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  url: string | null;
}

export interface ModSearchResult {
  hits: ModSearchHit[];
  total: number;
  offset: number;
}

export interface InstanceModContext {
  dir: string;
  loader?: string;
  /** Game version the server runs (Minecraft version for Minecraft). */
  gameVersion?: string;
}

interface ModrinthSearchResponse {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    author: string;
    downloads: number;
    icon_url?: string | null;
  }>;
  total_hits: number;
  offset: number;
}

interface ModrinthVersion {
  files: Array<{ url: string; filename: string; primary: boolean; size: number; hashes?: { sha1?: string } }>;
  version_type?: string;
}

const getJson = async <T>(url: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  } catch (error) {
    throw new DaemonError('UPSTREAM_ERROR', `Could not reach the mod catalog: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new DaemonError('UPSTREAM_ERROR', `The mod catalog answered with status ${response.status}.`);
  }
  return (await response.json()) as T;
};

/** Catalog loaders for this instance, from the source's declared mapping (never hardcoded here). */
const loaderCategories = (source: ModSourceSummary, loader?: string): string[] => {
  if (!loader) return [];
  return source.loaderCategories?.[loader] ?? [];
};

/** Download hosts are limited to the catalog's own domain (e.g. api.modrinth.com -> *.modrinth.com). */
export const isAllowedDownloadHost = (downloadUrl: string, baseUrl: string): boolean => {
  try {
    const target = new URL(downloadUrl);
    if (target.protocol !== 'https:') return false;
    const base = new URL(baseUrl).hostname.replace(/^api\./, '');
    return target.hostname === base || target.hostname.endsWith(`.${base}`);
  } catch {
    return false;
  }
};

export class ModCatalog {
  /** Search a catalog, filtered by the instance's loader and game version when known. */
  public static async search(
    source: ModSourceSummary,
    instance: InstanceModContext,
    query: string,
    offset = 0
  ): Promise<ModSearchResult> {
    const facets: string[][] = [];
    const categories = loaderCategories(source, instance.loader);
    if (categories.length > 0) facets.push(categories.map((category) => `categories:${category}`));
    if (instance.gameVersion) facets.push([`versions:${instance.gameVersion}`]);
    if (source.projectTypes?.length) facets.push(source.projectTypes.map((type) => `project_type:${type}`));

    const params = new URLSearchParams({
      query,
      limit: String(SEARCH_PAGE_SIZE),
      offset: String(Math.max(0, offset)),
      index: query ? 'relevance' : 'downloads'
    });
    if (facets.length > 0) params.set('facets', JSON.stringify(facets));

    const data = await getJson<ModrinthSearchResponse>(`${source.baseUrl}/search?${params.toString()}`);
    return {
      total: data.total_hits,
      offset: data.offset,
      hits: data.hits.map((hit) => ({
        projectId: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        author: hit.author,
        downloads: hit.downloads,
        iconUrl: hit.icon_url ?? null,
        url: source.projectUrl ? source.projectUrl.replace('{slug}', hit.slug) : null
      }))
    };
  }

  /** Downloads the newest compatible file of a project into the instance's mods/plugins folder. */
  public static async install(
    source: ModSourceSummary,
    instance: InstanceModContext,
    projectId: string,
    signal?: AbortSignal
  ): Promise<{ filename: string }> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) {
      throw new DaemonError('INVALID_PAYLOAD', 'Invalid project id.');
    }

    const params = new URLSearchParams();
    const categories = loaderCategories(source, instance.loader);
    if (categories.length > 0) params.set('loaders', JSON.stringify(categories));
    if (instance.gameVersion) params.set('game_versions', JSON.stringify([instance.gameVersion]));

    const versions = await getJson<ModrinthVersion[]>(
      `${source.baseUrl}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`
    );
    const best = versions.find((version) => version.version_type === 'release') ?? versions[0];
    const file = best?.files.find((candidate) => candidate.primary) ?? best?.files[0];
    if (!file) {
      throw new DaemonError('INVALID_VERSION', 'No compatible file was found for this server.');
    }
    if (!isAllowedDownloadHost(file.url, source.baseUrl)) {
      throw new DaemonError('UPSTREAM_ERROR', 'The catalog returned a download from an unexpected host.');
    }

    const filename = ModJarManager.validateModFilename(file.filename);
    const folder = path.join(instance.dir, (instance.loader && source.installDir?.[instance.loader]) || source.defaultInstallDir || 'mods');
    fs.mkdirSync(folder, { recursive: true });

    const temp = path.join(os.tmpdir(), `hosty-mod-${crypto.randomUUID()}.part`);
    try {
      await ServerInstaller.downloadFile(file.url, temp, { onLog: () => undefined, signal });
      const expected = file.hashes?.sha1;
      if (expected) {
        const actual = crypto.createHash('sha1').update(fs.readFileSync(temp)).digest('hex');
        if (actual.toLowerCase() !== expected.toLowerCase()) {
          throw new DaemonError('UPSTREAM_ERROR', 'The downloaded file failed its integrity check.');
        }
      }
      fs.copyFileSync(temp, path.join(folder, filename));
    } finally {
      fs.rmSync(temp, { force: true });
    }
    return { filename };
  }
}
