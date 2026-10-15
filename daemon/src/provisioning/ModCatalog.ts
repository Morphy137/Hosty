import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DaemonError } from '../errors';
import type { ModSourceSummary } from '../core/drivers/IGameDriver';
import { ModFileManager } from '../core/ModFileManager';
import { downloadFile } from './download';

const USER_AGENT = 'hosty/0.1 (https://github.com/Morphy137/Hosty)';
const SEARCH_PAGE_SIZE = 20;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const FACETS_TTL_MS = 60 * 60 * 1000;

export const MOD_SORTS = ['relevance', 'downloads', 'follows', 'newest', 'updated'] as const;
export type ModSort = (typeof MOD_SORTS)[number];

export interface ModSearchHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  categories: string[];
  iconUrl: string | null;
  url: string | null;
  updatedAt: string | null;
}

export interface ModSearchResult {
  hits: ModSearchHit[];
  total: number;
  offset: number;
}

export interface ModVersionInfo {
  id: string;
  name: string;
  versionNumber: string;
  type: 'release' | 'beta' | 'alpha';
  gameVersions: string[];
  loaders: string[];
  publishedAt: string;
  downloads: number;
  filename: string | null;
  size: number | null;
}

export interface ModFacets {
  sorts: readonly ModSort[];
  categories: Array<{ id: string; name: string }>;
  environments: Array<'client' | 'server'>;
  gameVersions: string[];
  loaders: string[];
}

export interface InstanceModContext {
  dir: string;
  loader?: string;
  /** Game version the server runs (as the catalog names versions). */
  gameVersion?: string;
}

/** Filters chosen in the UI. `null` for gameVersion / loader means "any"; undefined means "the instance's". */
export interface ModSearchOptions {
  sort?: ModSort;
  categories?: string[];
  environment?: 'client' | 'server';
  gameVersion?: string | null;
  loader?: string | null;
}

interface ModrinthSearchResponse {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    author: string;
    downloads: number;
    follows?: number;
    display_categories?: string[];
    categories?: string[];
    date_modified?: string;
    icon_url?: string | null;
  }>;
  total_hits: number;
  offset: number;
}

interface ModrinthVersion {
  id: string;
  name?: string;
  version_number?: string;
  version_type?: string;
  game_versions?: string[];
  loaders?: string[];
  date_published?: string;
  downloads?: number;
  files: Array<{ url: string; filename: string; primary: boolean; size: number; hashes?: { sha1?: string } }>;
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
const loaderCategories = (source: ModSourceSummary, loader?: string | null): string[] => {
  if (!loader) return [];
  return source.loaderCategories?.[loader] ?? [];
};

/** Resolves the effective filter value: explicit choice, "any" (null) or the instance's own. */
const effective = <T>(choice: T | null | undefined, instanceValue: T | undefined): T | undefined =>
  choice === null ? undefined : (choice ?? instanceValue);

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

const pickFile = (version: ModrinthVersion) => version.files.find((file) => file.primary) ?? version.files[0];

const toVersionInfo = (version: ModrinthVersion): ModVersionInfo => {
  const file = pickFile(version);
  const type = version.version_type === 'beta' || version.version_type === 'alpha' ? version.version_type : 'release';
  return {
    id: version.id,
    name: version.name || version.version_number || version.id,
    versionNumber: version.version_number ?? '',
    type,
    gameVersions: version.game_versions ?? [],
    loaders: version.loaders ?? [],
    publishedAt: version.date_published ?? '',
    downloads: version.downloads ?? 0,
    filename: file?.filename ?? null,
    size: file?.size ?? null
  };
};

const facetsCache = new Map<string, { at: number; value: ModFacets }>();

/** API dialects this module speaks. A pack declaring any other `type` gets no catalog instead of wrong requests. */
export const MOD_SOURCE_DIALECTS: ReadonlyArray<ModSourceSummary['type']> = ['modrinth'];

export class ModCatalog {
  public static supports(source: { type?: string }): boolean {
    return (MOD_SOURCE_DIALECTS as readonly string[]).includes(source.type ?? '');
  }

  /** Sort options, categories, environments, game versions and loaders the catalog can filter by. */
  public static async getFacets(source: ModSourceSummary): Promise<ModFacets> {
    const cached = facetsCache.get(source.baseUrl);
    if (cached && Date.now() - cached.at < FACETS_TTL_MS) return cached.value;

    const types = source.projectTypes ?? [];
    const [categories, gameVersions] = await Promise.all([
      getJson<Array<{ name: string; project_type: string }>>(`${source.baseUrl}/tag/category`).catch(() => []),
      getJson<Array<{ version: string; version_type: string }>>(`${source.baseUrl}/tag/game_version`).catch(() => [])
    ]);

    const seen = new Set<string>();
    const categoryList = categories
      // Only categories of installable server content (not resource packs, shaders...).
      .filter((category) => [...types, 'mod', 'plugin'].includes(category.project_type))
      .filter((category) => (seen.has(category.name) ? false : (seen.add(category.name), true)))
      .map((category) => ({ id: category.name, name: category.name }));

    const value: ModFacets = {
      sorts: MOD_SORTS,
      categories: categoryList,
      environments: ['client', 'server'],
      gameVersions: gameVersions.filter((entry) => entry.version_type === 'release').map((entry) => entry.version),
      loaders: Object.keys(source.loaderCategories ?? {})
    };
    facetsCache.set(source.baseUrl, { at: Date.now(), value });
    return value;
  }

  /**
   * Fetches a catalog image (project icon) on behalf of the UI, whose CSP only allows the daemon origin.
   * The URL must be https and belong to the catalog's own domain.
   */
  public static async fetchIcon(source: ModSourceSummary, url: string): Promise<{ type: string; data: Buffer }> {
    if (!isAllowedDownloadHost(url, source.baseUrl)) {
      throw new DaemonError('INVALID_PAYLOAD', 'The image does not belong to this catalog.');
    }
    let response: Response;
    try {
      response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (error) {
      throw new DaemonError('UPSTREAM_ERROR', `Could not reach the catalog image: ${(error as Error).message}`);
    }
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/')) {
      throw new DaemonError('UPSTREAM_ERROR', 'The catalog did not return an image.');
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_ICON_BYTES) {
      throw new DaemonError('UPSTREAM_ERROR', 'The catalog image is too large.');
    }
    return { type, data };
  }

  /** Search a catalog, filtered by the chosen loader / game version (defaults: the instance's). */
  public static async search(
    source: ModSourceSummary,
    instance: InstanceModContext,
    query: string,
    offset = 0,
    options: ModSearchOptions = {}
  ): Promise<ModSearchResult> {
    const loader = effective(options.loader, instance.loader);
    const gameVersion = effective(options.gameVersion, instance.gameVersion);

    const facets: string[][] = [];
    const categories = loaderCategories(source, loader);
    if (categories.length > 0) facets.push(categories.map((category) => `categories:${category}`));
    if (gameVersion) facets.push([`versions:${gameVersion}`]);
    if (source.projectTypes?.length) facets.push(source.projectTypes.map((type) => `project_type:${type}`));
    // Every chosen category must match (AND), like the catalog's own site.
    for (const category of options.categories ?? []) facets.push([`categories:${category}`]);
    if (options.environment === 'server') facets.push(['server_side:required', 'server_side:optional']);
    if (options.environment === 'client') facets.push(['client_side:required', 'client_side:optional']);

    const sort: ModSort = options.sort && MOD_SORTS.includes(options.sort) ? options.sort : query ? 'relevance' : 'downloads';
    const params = new URLSearchParams({
      query,
      limit: String(SEARCH_PAGE_SIZE),
      offset: String(Math.max(0, offset)),
      index: sort
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
        follows: hit.follows ?? 0,
        categories: hit.display_categories ?? hit.categories ?? [],
        iconUrl: hit.icon_url ?? null,
        url: source.projectUrl ? source.projectUrl.replace('{slug}', hit.slug) : null,
        updatedAt: hit.date_modified ?? null
      }))
    };
  }

  /** Versions of a project compatible with the chosen loader / game version (newest first). */
  public static async listVersions(
    source: ModSourceSummary,
    instance: InstanceModContext,
    projectId: string,
    options: Pick<ModSearchOptions, 'gameVersion' | 'loader'> = {}
  ): Promise<ModVersionInfo[]> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) {
      throw new DaemonError('INVALID_PAYLOAD', 'Invalid project id.');
    }
    const params = new URLSearchParams();
    const categories = loaderCategories(source, effective(options.loader, instance.loader));
    if (categories.length > 0) params.set('loaders', JSON.stringify(categories));
    const gameVersion = effective(options.gameVersion, instance.gameVersion);
    if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));

    const versions = await getJson<ModrinthVersion[]>(
      `${source.baseUrl}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`
    );
    return versions.filter((version) => version.files.length > 0).map(toVersionInfo);
  }

  /**
   * Downloads a file of a project into the instance's mods/plugins folder: the chosen version, or the
   * newest compatible release when none is given.
   */
  public static async install(
    source: ModSourceSummary,
    instance: InstanceModContext,
    projectId: string,
    versionId?: string,
    signal?: AbortSignal
  ): Promise<{ filename: string; version: string }> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) {
      throw new DaemonError('INVALID_PAYLOAD', 'Invalid project id.');
    }

    let chosen: ModrinthVersion | undefined;
    if (versionId) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(versionId)) {
        throw new DaemonError('INVALID_PAYLOAD', 'Invalid version id.');
      }
      chosen = await getJson<ModrinthVersion>(`${source.baseUrl}/version/${encodeURIComponent(versionId)}`);
    } else {
      const params = new URLSearchParams();
      const categories = loaderCategories(source, instance.loader);
      if (categories.length > 0) params.set('loaders', JSON.stringify(categories));
      if (instance.gameVersion) params.set('game_versions', JSON.stringify([instance.gameVersion]));
      const versions = await getJson<ModrinthVersion[]>(
        `${source.baseUrl}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`
      );
      chosen = versions.find((version) => version.version_type === 'release') ?? versions[0];
    }

    const file = chosen ? pickFile(chosen) : undefined;
    if (!chosen || !file) {
      throw new DaemonError('INVALID_VERSION', 'No compatible file was found for this server.');
    }
    if (!isAllowedDownloadHost(file.url, source.baseUrl)) {
      throw new DaemonError('UPSTREAM_ERROR', 'The catalog returned a download from an unexpected host.');
    }

    const filename = ModFileManager.validateModFilename(file.filename);
    const folder = path.join(
      instance.dir,
      (instance.loader && source.installDir?.[instance.loader]) || source.defaultInstallDir || 'mods'
    );
    fs.mkdirSync(folder, { recursive: true });

    const temp = path.join(os.tmpdir(), `hosty-mod-${crypto.randomUUID()}.part`);
    try {
      await downloadFile(file.url, temp, { onLog: () => undefined, signal });
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
    return { filename, version: chosen.version_number ?? chosen.id };
  }
}
