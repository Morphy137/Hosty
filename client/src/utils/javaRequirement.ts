import type { InstallerSpec } from '../types/daemon';

/** Compares dotted version strings numerically ("1.20.5" < "1.21" < "26.1"); non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Java major version a game version needs, from the game's declared `installer.javaRequirements`. */
export function requiredJavaMajor(
  requirements: InstallerSpec['javaRequirements'],
  gameVersion: string | null | undefined
): number | null {
  if (!requirements) return null;
  if (!gameVersion || !/^\d+(\.\d+)*$/.test(gameVersion)) return requirements.default;
  let required = requirements.default;
  for (const entry of requirements.versions) {
    if (compareVersions(gameVersion, entry.from) >= 0) required = entry.java;
  }
  return required;
}

export type JavaCheck =
  | { status: 'unknown' }
  | { status: 'missing'; required: number }
  | { status: 'outdated'; required: number; installed: number }
  | { status: 'ok'; required: number; installed: number };

/** Compares the detected Java with what the chosen game version needs (unknown when the game declares nothing). */
export function checkJava(
  installedMajor: number | null | undefined,
  requirements: InstallerSpec['javaRequirements'],
  gameVersion: string | null | undefined
): JavaCheck {
  const required = requiredJavaMajor(requirements, gameVersion);
  if (installedMajor === undefined || required === null) return { status: 'unknown' };
  if (installedMajor === null) return { status: 'missing', required };
  if (installedMajor < required) return { status: 'outdated', required, installed: installedMajor };
  return { status: 'ok', required, installed: installedMajor };
}
