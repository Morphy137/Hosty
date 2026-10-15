// Bundles the daemon into a single executable (esbuild + Node SEA) and places it where
// Tauri expects an `externalBin` sidecar: client/src-tauri/binaries/hosty-daemon-<triple>[.exe]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const daemonDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(daemonDir, 'build', 'sea');
const binariesDir = resolve(daemonDir, '..', 'client', 'src-tauri', 'binaries');
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const detectTargetTriple = () => {
  if (process.env.HOSTY_TARGET_TRIPLE) return process.env.HOSTY_TARGET_TRIPLE;
  try {
    const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
    const match = /host:\s*(\S+)/.exec(out);
    if (match) return match[1];
  } catch {
    // rustc not available: fall back to the Node platform/arch
  }
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`;
  if (process.platform === 'darwin') return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
};

const triple = detectTargetTriple();
const exeSuffix = triple.includes('windows') ? '.exe' : '';

// `--if-missing` keeps `tauri dev` fast: the sidecar is only needed to satisfy the bundle config there.
if (process.argv.includes('--if-missing') && existsSync(join(binariesDir, `hosty-daemon-${triple}${exeSuffix}`))) {
  console.log('[sidecar] already built, skipping');
  process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(binariesDir, { recursive: true });

console.log('[sidecar] bundling with esbuild');
const bundlePath = join(outDir, 'daemon.cjs');
await build({
  entryPoints: [join(daemonDir, 'src', 'index.ts')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning'
});

console.log('[sidecar] generating SEA blob');
const seaConfigPath = join(outDir, 'sea-config.json');
const blobPath = join(outDir, 'sea-prep.blob');
writeFileSync(
  seaConfigPath,
  JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true })
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });

const target = join(binariesDir, `hosty-daemon-${triple}${exeSuffix}`);
copyFileSync(process.execPath, target);
if (process.platform === 'darwin') {
  // The copied Node binary is signed; the signature must go before the blob is injected.
  execFileSync('codesign', ['--remove-signature', target], { stdio: 'inherit' });
}

console.log(`[sidecar] injecting blob into ${target}`);
const postjectCli = join(daemonDir, 'node_modules', 'postject', 'dist', 'cli.js');
if (!existsSync(postjectCli)) throw new Error('postject is not installed; run `npm ci` in daemon/');
const injectArgs = [postjectCli, target, 'NODE_SEA_BLOB', blobPath, '--sentinel-fuse', SEA_FUSE];
if (process.platform === 'darwin') injectArgs.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, injectArgs, { stdio: 'inherit' });
if (process.platform === 'darwin') {
  // Ad-hoc re-sign so the binary runs; the app bundle signing (CI) replaces this.
  execFileSync('codesign', ['--sign', '-', target], { stdio: 'inherit' });
}
if (process.platform !== 'win32') chmodSync(target, 0o755);

console.log(`[sidecar] done: ${target}`);
