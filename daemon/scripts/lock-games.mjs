// Records the version and content hash of every bundled game pack in game-packs.lock.json.
// A pack whose content changed keeps its old entry until its `version` is bumped: installed copies (seeded or
// from the catalog) only update on a higher version, so an unbumped change would never reach users.
// Run after build:games so each driver.js is current: `npm --prefix daemon run lock:games`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBundledPacks, packContentHash } from './pack-hash.mjs';

const daemonDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(daemonDir, 'assets', 'games');
const lockPath = join(daemonDir, 'game-packs.lock.json');

const previous = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf-8')) : {};
const next = {};
const unbumped = [];

for (const pack of listBundledPacks(gamesDir).sort((a, b) => a.id.localeCompare(b.id))) {
  const contentHash = packContentHash(pack.dir);
  const locked = previous[pack.id];
  if (locked && locked.version === pack.version && locked.contentHash !== contentHash) {
    unbumped.push(pack.id);
    next[pack.id] = locked;
    continue;
  }
  next[pack.id] = { version: pack.version, contentHash };
}

writeFileSync(lockPath, `${JSON.stringify(next, null, 2)}\n`);

if (unbumped.length > 0) {
  console.error(`[games] changed without a version bump: ${unbumped.join(', ')}. Bump "version" in their hosty-game.json.`);
  process.exit(1);
}
console.log(`[games] locked ${Object.keys(next).length} packs -> ${lockPath}`);
