import fs from 'fs';
import os from 'os';
import path from 'path';
import { DaemonError } from '../../errors';
import type { GameDriverRegistry } from '../drivers/GameDriverRegistry';
import type { PackInfo } from '../gamepacks/PackLoader';
import { isNewerVersion } from '../gamepacks/PackSeeder';
import {
  catalogFileUrl,
  downloadCatalogPack,
  fetchCatalog,
  type CatalogAuthor,
  type CatalogSource
} from './Catalog';

/** A catalog pack as the UI shows it, with what is installed locally. */
export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  author: CatalogAuthor | null;
  description: string | Record<string, string> | null;
  category: string | null;
  status: string;
  logoUrl: string | null;
  hasCode: boolean;
  /** Total download size in bytes. */
  size: number;
  installedVersion: string | null;
  updateAvailable: boolean;
}

/** Fetches the signed catalog and marks which packs are installed and which have a newer version. */
export async function listCatalog(source: CatalogSource, installed: PackInfo[]): Promise<CatalogEntry[]> {
  const index = await fetchCatalog(source);
  const installedVersions = new Map(installed.filter((pack) => pack.id).map((pack) => [pack.id as string, pack.version]));

  return index.packs.map((pack) => {
    const installedVersion = installedVersions.get(pack.id) ?? null;
    return {
      id: pack.id,
      name: pack.name,
      version: pack.version,
      author: pack.author,
      description: pack.description,
      category: pack.category,
      status: pack.status,
      logoUrl: pack.logo ? catalogFileUrl(source.baseUrl, pack.id, pack.logo) : null,
      hasCode: pack.hasCode,
      size: pack.files.reduce((total, file) => total + file.size, 0),
      installedVersion,
      updateAvailable: installedVersion !== null && isNewerVersion(pack.version, installedVersion)
    };
  });
}

/**
 * Installs (or updates) a pack from the catalog. Every file was checked against the signed index, so a pack's
 * `driver.js` is approved without asking: the signature is what vouches for it.
 */
export async function installFromCatalog(
  source: CatalogSource,
  packId: string,
  registry: GameDriverRegistry
): Promise<PackInfo[]> {
  const index = await fetchCatalog(source);
  const pack = index.packs.find((candidate) => candidate.id === packId);
  if (!pack) throw new DaemonError('INVALID_PAYLOAD', `"${packId}" is not in the game catalog.`);

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-catalog-'));
  try {
    await downloadCatalogPack(source, pack, stagingDir);
    try {
      return registry.installPack(stagingDir, { trustCode: pack.hasCode });
    } catch (error) {
      throw new DaemonError('INVALID_FOLDER', error instanceof Error ? error.message : String(error));
    }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
