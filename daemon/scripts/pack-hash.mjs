// Content hash of a game pack folder, used to detect bundled packs that changed without a version bump.
// Text files are hashed with LF line endings so a Windows checkout (core.autocrlf) and CI agree.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const TEXT_EXTENSIONS = new Set(['.js', '.json', '.svg', '.md', '.txt']);

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .flatMap((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]));

const normalizedContent = (file) => {
  const content = readFileSync(file);
  if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) return content;
  return Buffer.from(content.toString('utf-8').replace(/\r\n/g, '\n'), 'utf-8');
};

/** SHA-256 over every file of the pack (relative path + content hash), in a stable order. */
export function packContentHash(packDir) {
  const hash = createHash('sha256');
  const files = listFiles(packDir)
    .map((file) => ({ file, path: relative(packDir, file).split(sep).join('/') }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const { file, path } of files) {
    const fileHash = createHash('sha256').update(normalizedContent(file)).digest('hex');
    hash.update(`${path}\0${fileHash}\n`);
  }
  return hash.digest('hex');
}

/** Bundled pack folders (those with a manifest) as `{ id, dir, version }`. */
export function listBundledPacks(gamesDir) {
  return readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .flatMap((entry) => {
      const dir = join(gamesDir, entry.name);
      try {
        const manifest = JSON.parse(readFileSync(join(dir, 'hosty-game.json'), 'utf-8'));
        return [{ id: manifest.id, dir, version: manifest.version }];
      } catch {
        return [];
      }
    });
}
