import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DaemonError } from '../../errors';

export const CATALOG_API_VERSION = 1;
const INDEX_FILE = 'index.json';
const SIGNATURE_FILE = 'index.json.sig';
const PACKS_DIR = 'packs';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PACK_FILE_BYTES = 64 * 1024 * 1024;
const PACK_ID_PATTERN = /^[a-z0-9-]{2,40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const USER_AGENT = { 'User-Agent': 'hosty (https://github.com/Morphy137/Hosty)' };

export interface CatalogFile {
  path: string;
  sha256: string;
  size: number;
}

export interface CatalogAuthor {
  name: string;
  url?: string;
}

export interface CatalogPack {
  id: string;
  name: string;
  version: string;
  author: CatalogAuthor | null;
  description: string | Record<string, string> | null;
  category: string | null;
  status: string;
  logo: string | null;
  /** The pack ships a `driver.js`; the signed index vouches for its hash. */
  hasCode: boolean;
  files: CatalogFile[];
}

export interface CatalogIndex {
  apiVersion: number;
  generatedAt: string;
  packs: CatalogPack[];
}

export interface CatalogSource {
  /** Base URL (no trailing slash needed) holding `index.json`, `index.json.sig` and `packs/<id>/...`. */
  baseUrl: string;
  /** PEM public key the index signature must verify against. */
  publicKey: string;
  fetchImpl?: typeof fetch;
}

const isSafePackPath = (value: string): boolean =>
  value.length > 0 &&
  !path.isAbsolute(value) &&
  !value.includes('\\') &&
  !value.includes(':') &&
  value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/** True when `signature` (base64) is a valid Ed25519 signature of exactly `content` made by the key's owner. */
export function verifyCatalogSignature(content: Uint8Array, signature: string, publicKey: string): boolean {
  try {
    return crypto.verify(null, content, crypto.createPublicKey(publicKey), Buffer.from(signature.trim(), 'base64'));
  } catch {
    return false;
  }
}

const joinUrl = (baseUrl: string, ...segments: string[]): string =>
  [baseUrl.replace(/\/+$/, ''), ...segments.map((segment) => segment.split('/').map(encodeURIComponent).join('/'))].join('/');

export const catalogFileUrl = (baseUrl: string, packId: string, filePath: string): string =>
  joinUrl(baseUrl, PACKS_DIR, packId, filePath);

const upstreamError = (message: string): DaemonError => new DaemonError('UPSTREAM_ERROR', message);

async function fetchBytes(source: CatalogSource, url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await (source.fetchImpl ?? fetch)(url, { headers: USER_AGENT, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw upstreamError(`Could not reach the game catalog: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw upstreamError(`The game catalog answered ${response.status} for ${url}.`);
  return Buffer.from(await response.arrayBuffer());
}

function parseIndex(raw: unknown): CatalogIndex {
  const index = raw as Partial<CatalogIndex> | null;
  if (!index || index.apiVersion !== CATALOG_API_VERSION || !Array.isArray(index.packs)) {
    throw upstreamError('The game catalog has an unsupported format.');
  }
  for (const pack of index.packs) {
    const validFiles =
      Array.isArray(pack?.files) &&
      pack.files.every(
        (file) =>
          isSafePackPath(String(file?.path)) &&
          SHA256_PATTERN.test(String(file?.sha256)) &&
          Number.isInteger(file?.size) &&
          file.size >= 0 &&
          file.size <= MAX_PACK_FILE_BYTES
      );
    if (!PACK_ID_PATTERN.test(String(pack?.id)) || typeof pack.name !== 'string' || typeof pack.version !== 'string' || !validFiles) {
      throw upstreamError(`The game catalog lists an invalid pack (${String(pack?.id)}).`);
    }
  }
  return index as CatalogIndex;
}

/** Downloads the catalog index and returns it only if its signature verifies with the app's public key. */
export async function fetchCatalog(source: CatalogSource): Promise<CatalogIndex> {
  const [indexBytes, signatureBytes] = await Promise.all([
    fetchBytes(source, joinUrl(source.baseUrl, INDEX_FILE)),
    fetchBytes(source, joinUrl(source.baseUrl, SIGNATURE_FILE))
  ]);
  if (!verifyCatalogSignature(indexBytes, signatureBytes.toString('utf-8'), source.publicKey)) {
    throw upstreamError('The game catalog signature is not valid; it was not trusted.');
  }
  try {
    return parseIndex(JSON.parse(indexBytes.toString('utf-8')));
  } catch (error) {
    if (error instanceof DaemonError) throw error;
    throw upstreamError('The game catalog is not valid JSON.');
  }
}

/**
 * Downloads every file of `pack` into `destDir`, rejecting any file whose size or SHA-256 differs from what the
 * signed index declares. Nothing is written outside `destDir`.
 */
export async function downloadCatalogPack(source: CatalogSource, pack: CatalogPack, destDir: string): Promise<void> {
  for (const file of pack.files) {
    const content = await fetchBytes(source, catalogFileUrl(source.baseUrl, pack.id, file.path));
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (content.length !== file.size || digest !== file.sha256) {
      throw upstreamError(`"${file.path}" of ${pack.id} does not match the signed catalog; the download was discarded.`);
    }
    const target = path.join(destDir, ...file.path.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
