// Bundles the code of every game that ships with Hosty into the `driver.js` of its pack folder:
// src/extensions/<id>/driver-entry.ts -> assets/games/<id>/driver.js (generated, not committed).
import { build } from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const daemonDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionsDir = join(daemonDir, 'src', 'extensions');
const gamesDir = join(daemonDir, 'assets', 'games');

for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
  const entryPoint = join(extensionsDir, entry.name, 'driver-entry.ts');
  if (!entry.isDirectory() || !existsSync(entryPoint)) continue;
  const outfile = join(gamesDir, entry.name, 'driver.js');
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'warning'
  });
  console.log(`[games] ${entry.name} -> ${outfile}`);
}
