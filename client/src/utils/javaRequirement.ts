/** Minimum Java major version a Minecraft release needs (as documented by Mojang). */
export function requiredJavaMajor(mcVersion: string | null | undefined): number {
  if (!mcVersion) return 21;
  const parts = mcVersion.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return 21;

  const [first, second = 0, third = 0] = parts;
  // Year-based releases (26.x and later) ship after 1.21 and need the current LTS or newer.
  if (first >= 26) return 21;
  if (first !== 1) return 21;

  if (second >= 21) return 21;
  if (second === 20) return third >= 5 ? 21 : 17;
  if (second >= 18) return 17;
  if (second === 17) return 16;
  return 8;
}

export type JavaCheck =
  | { status: 'unknown' }
  | { status: 'missing'; required: number }
  | { status: 'outdated'; required: number; installed: number }
  | { status: 'ok'; required: number; installed: number };

/** Compares the detected Java with what the selected Minecraft version needs. */
export function checkJava(installedMajor: number | null | undefined, mcVersion: string | null | undefined): JavaCheck {
  if (installedMajor === undefined) return { status: 'unknown' };
  const required = requiredJavaMajor(mcVersion);
  if (installedMajor === null) return { status: 'missing', required };
  if (installedMajor < required) return { status: 'outdated', required, installed: installedMajor };
  return { status: 'ok', required, installed: installedMajor };
}
