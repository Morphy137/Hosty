import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';
import { BRIDGE_DIR_NAME } from './bridge/BridgeAuth';

/** Icon shown inside Hosty, for every game. */
export const APP_ICON_FILE = path.join(BRIDGE_DIR_NAME, 'icon.png');
/** Where icons were written for every game before games declared `serverIcon`; still read as a fallback. */
const LEGACY_ICON_FILE = 'server-icon.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_ICON_BYTES = 2 * 1024 * 1024;

export interface ServerIconSpec {
  file: string;
  size: number;
}

/** What happened to the game's own icon file when an icon was saved. */
export type GameIconResult = 'written' | 'unsupported' | 'wrong-size';

/** Width and height from a PNG header, or null when the buffer is not a PNG. */
export function pngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const insideInstance = (dir: string, relative: string): string => {
  const target = path.resolve(dir, relative);
  const rel = path.relative(path.resolve(dir), target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new DaemonError('INVALID_PAYLOAD', `Icon path "${relative}" is outside the instance.`);
  }
  return target;
};

/** The icon to show in the app: Hosty's own copy, else the game's file, else the legacy file. */
export function findInstanceIcon(dir: string, spec?: ServerIconSpec): string | null {
  const candidates = [APP_ICON_FILE, spec?.file, LEGACY_ICON_FILE].filter((entry): entry is string => Boolean(entry));
  for (const relative of candidates) {
    const file = insideInstance(dir, relative);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * Stores the icon for the app and, when the game declares a `serverIcon`, also as the game's own file.
 * The game file is only written when the PNG has exactly the size the game requires.
 */
export function saveInstanceIcon(dir: string, buffer: Buffer, spec?: ServerIconSpec): GameIconResult {
  if (buffer.length > MAX_ICON_BYTES) throw new DaemonError('INVALID_PAYLOAD', 'The icon is too large (max 2 MB).');
  const size = pngSize(buffer);
  if (!size) throw new DaemonError('INVALID_PAYLOAD', 'The icon must be a PNG image.');

  const appIcon = insideInstance(dir, APP_ICON_FILE);
  fs.mkdirSync(path.dirname(appIcon), { recursive: true });
  fs.writeFileSync(appIcon, buffer);

  if (!spec) return 'unsupported';
  if (size.width !== spec.size || size.height !== spec.size) return 'wrong-size';
  const gameIcon = insideInstance(dir, spec.file);
  fs.mkdirSync(path.dirname(gameIcon), { recursive: true });
  fs.writeFileSync(gameIcon, buffer);
  return 'written';
}

/** Removes the app icon, the game's icon file and the legacy file. */
export function deleteInstanceIcon(dir: string, spec?: ServerIconSpec): void {
  for (const relative of [APP_ICON_FILE, spec?.file, LEGACY_ICON_FILE]) {
    if (!relative) continue;
    fs.rmSync(insideInstance(dir, relative), { force: true });
  }
}
