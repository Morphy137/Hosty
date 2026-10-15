/** Version catalog helpers for Forge and NeoForge, which publish their installers on Maven. */

export const FORGE_METADATA_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
export const NEOFORGE_METADATA_URL =
  'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

/** Oldest Minecraft version for which the Forge installer flow is supported. */
const MIN_FORGE_MC_VERSION = '1.12.2';
const MAX_VERSIONS = 15;

export const parseMavenVersions = (xml: string): string[] => {
  const block = /<versions>([\s\S]*?)<\/versions>/.exec(xml)?.[1] ?? '';
  const versions: string[] = [];
  const pattern = /<version>\s*([^<\s]+)\s*<\/version>/g;
  for (let match = pattern.exec(block); match; match = pattern.exec(block)) {
    versions.push(match[1]);
  }
  return versions;
};

/** Numeric comparison of dotted versions; missing parts count as 0. */
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const sortNewestFirst = (versions: Iterable<string>): string[] =>
  [...new Set(versions)].sort((a, b) => compareVersions(b, a));

/** Forge versions look like `1.20.1-47.2.0`; the part before the first dash is the Minecraft version. */
export const forgeMinecraftVersions = (mavenVersions: string[]): string[] =>
  sortNewestFirst(
    mavenVersions
      .map((version) => version.split('-')[0])
      .filter((mc) => /^(1|\d{2})\.\d+(\.\d+)?$/.test(mc) && compareVersions(mc, MIN_FORGE_MC_VERSION) >= 0)
  ).slice(0, MAX_VERSIONS);

/** Metadata lists versions oldest to newest, so the last match is the latest build. */
export const latestForgeVersion = (mavenVersions: string[], mcVersion: string): string | null => {
  const matches = mavenVersions.filter((version) => version.startsWith(`${mcVersion}-`));
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

export const forgeInstallerUrl = (forgeVersion: string): string =>
  `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;

/**
 * NeoForge `21.1.172` targets Minecraft `1.21.1` (`21.0.x` -> `1.21`). Since Minecraft moved to
 * year-based versions, `26.1.2.117` targets `26.1.2` and `26.3.0.77` targets `26.3`.
 */
export const neoForgeToMinecraftVersion = (neoForgeVersion: string): string | null => {
  const parts = neoForgeVersion.split(/[.-]/).slice(0, 4).map((part) => Number.parseInt(part, 10));
  if (parts.length < 3 || parts.slice(0, 3).some((part) => Number.isNaN(part))) return null;
  const [major, minor, patch] = parts;
  if (major < 20) return null;
  if (major >= 26) return patch > 0 ? `${major}.${minor}.${patch}` : `${major}.${minor}`;
  return minor > 0 ? `1.${major}.${minor}` : `1.${major}`;
};

export const neoForgeMinecraftVersions = (mavenVersions: string[]): string[] =>
  sortNewestFirst(
    mavenVersions
      .map((version) => neoForgeToMinecraftVersion(version))
      .filter((mc): mc is string => mc !== null)
  ).slice(0, MAX_VERSIONS);

export const latestNeoForgeVersion = (mavenVersions: string[], mcVersion: string): string | null => {
  const matches = mavenVersions.filter((version) => neoForgeToMinecraftVersion(version) === mcVersion);
  const stable = matches.filter((version) => !/-(alpha|beta|rc)/i.test(version));
  const pool = stable.length > 0 ? stable : matches;
  return pool.length > 0 ? pool.slice().sort(compareVersions)[pool.length - 1] : null;
};

export const neoForgeInstallerUrl = (neoForgeVersion: string): string =>
  `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoForgeVersion}/neoforge-${neoForgeVersion}-installer.jar`;
