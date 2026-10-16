// Builds the signed pack catalog.
// Usage: node catalog/scripts/build-catalog.mjs --packs <dir> --out <dir> --key <private-key-file>
//   (the key may instead come from the HOSTY_CATALOG_KEY environment variable, e.g. a CI secret)
// Output: <out>/index.json, <out>/index.json.sig (base64 Ed25519 over the exact bytes of index.json) and
// <out>/packs/<id>/... (the pack files, each listed in the index with its SHA-256 and size).
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

const INDEX_API_VERSION = 1;
const IGNORED_NAMES = new Set(['node_modules', '.git', '.DS_Store', 'Thumbs.db']);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const packsDir = args.get('--packs');
const outDir = args.get('--out');
const keyFile = args.get('--key');
const keyPem = process.env.HOSTY_CATALOG_KEY || (keyFile ? readFileSync(resolve(keyFile), 'utf-8') : '');
if (!packsDir || !outDir || !keyPem) {
  console.error('Usage: node build-catalog.mjs --packs <dir> --out <dir> --key <private-key-file>');
  process.exit(1);
}

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith('.')) return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });

const out = resolve(outDir);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'packs'), { recursive: true });

const packs = [];
for (const entry of readdirSync(resolve(packsDir), { withFileTypes: true })) {
  const packDir = join(resolve(packsDir), entry.name);
  const manifestPath = join(packDir, 'hosty-game.json');
  if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  const files = listFiles(packDir).map((file) => {
    const content = readFileSync(file);
    return {
      path: relative(packDir, file).split(sep).join('/'),
      sha256: createHash('sha256').update(content).digest('hex'),
      size: statSync(file).size
    };
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  cpSync(packDir, join(out, 'packs', manifest.id), { recursive: true, filter: (source) => !IGNORED_NAMES.has(basename(source)) });

  packs.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author ?? null,
    description: manifest.description ?? null,
    category: manifest.category ?? null,
    status: manifest.status ?? 'available',
    logo: manifest.logo ?? null,
    hasCode: files.some((file) => file.path === 'driver.js'),
    files
  });
}
packs.sort((a, b) => a.id.localeCompare(b.id));

const indexBytes = Buffer.from(`${JSON.stringify({ apiVersion: INDEX_API_VERSION, generatedAt: new Date().toISOString(), packs }, null, 2)}\n`);
const signature = sign(null, indexBytes, createPrivateKey(keyPem)).toString('base64');
writeFileSync(join(out, 'index.json'), indexBytes);
writeFileSync(join(out, 'index.json.sig'), `${signature}\n`);
console.log(`[catalog] ${packs.length} packs -> ${out}`);
