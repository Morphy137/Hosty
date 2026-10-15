import AdmZip from 'adm-zip';

export type DetectedLoader = 'vanilla' | 'paper' | 'purpur' | 'fabric' | 'forge' | 'neoforge' | 'spigot';
export type JarKind = 'server' | 'installer' | 'unknown';

export interface JarInspection {
  /** Detected loader, or null when the jar matches no known signature. */
  loader: DetectedLoader | null;
  mcVersion: string | null;
  loaderVersion: string | null;
  /** `installer` jars must be executed once (`--installServer`) before the server can start. */
  kind: JarKind;
}

/** Minimal view of a jar so the detection rules can be unit-tested without real archives. */
export interface JarEntries {
  names: ReadonlySet<string>;
  readText: (name: string) => string | null;
}

const UNKNOWN: JarInspection = { loader: null, mcVersion: null, loaderVersion: null, kind: 'unknown' };
const MC_VERSION_PATTERN = /\b(?:1\.\d{1,2}|\d{2}\.\d{1,2})(?:\.\d{1,2})?\b/;

const hasPrefix = (names: ReadonlySet<string>, prefix: string): boolean => {
  for (const name of names) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
};

const parseJson = <T>(text: string | null): T | null => {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/** Pure classification of a server/installer jar from its entry list and a few small files. */
export function classifyJar(entries: JarEntries): JarInspection {
  const { names, readText } = entries;

  if (names.has('install_profile.json')) {
    const profile = parseJson<{ minecraft?: string; version?: string; install?: { minecraft?: string } }>(
      readText('install_profile.json')
    );
    const mcVersion = profile?.minecraft ?? profile?.install?.minecraft ?? null;
    const version = profile?.version ?? null;
    if (hasPrefix(names, 'net/neoforged/')) {
      const match = version ? /neoforge-(.+)$/.exec(version) : null;
      return { loader: 'neoforge', mcVersion, loaderVersion: match ? match[1] : version, kind: 'installer' };
    }
    if (hasPrefix(names, 'net/minecraftforge/')) {
      const match = version ? /forge-(.+)$/.exec(version) : null;
      return { loader: 'forge', mcVersion, loaderVersion: match ? match[1] : version, kind: 'installer' };
    }
  }

  if (hasPrefix(names, 'io/papermc/paperclip/') || names.has('META-INF/versions.list') && names.has('META-INF/download-context')) {
    const context = `${readText('META-INF/versions.list') ?? ''}\n${readText('META-INF/download-context') ?? ''}`;
    const loader: DetectedLoader = /purpur/i.test(context) ? 'purpur' : 'paper';
    const mcVersion = MC_VERSION_PATTERN.exec(context)?.[0] ?? null;
    return { loader, mcVersion, loaderVersion: null, kind: 'server' };
  }

  if (
    names.has('fabric-server-launch.properties') ||
    names.has('fabric-server-launcher.properties') ||
    hasPrefix(names, 'net/fabricmc/')
  ) {
    return { loader: 'fabric', mcVersion: null, loaderVersion: null, kind: 'server' };
  }

  if (hasPrefix(names, 'org/bukkit/craftbukkit/') || hasPrefix(names, 'org/spigotmc/')) {
    const pom = readText('META-INF/maven/org.spigotmc/spigot/pom.properties');
    const mcVersion = pom ? (MC_VERSION_PATTERN.exec(pom)?.[0] ?? null) : null;
    return { loader: 'spigot', mcVersion, loaderVersion: null, kind: 'server' };
  }

  if (names.has('version.json') && (hasPrefix(names, 'net/minecraft/server/') || hasPrefix(names, 'net/minecraft/bundler/'))) {
    const version = parseJson<{ id?: string }>(readText('version.json'));
    return { loader: 'vanilla', mcVersion: version?.id ?? null, loaderVersion: null, kind: 'server' };
  }

  return { ...UNKNOWN };
}

/** Opens a jar on disk and classifies it. Unreadable archives are reported as unknown. */
export function inspectJar(filePath: string): JarInspection {
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    const names = new Set(zipEntries.map((entry) => entry.entryName));
    return classifyJar({
      names,
      readText: (name) => {
        const entry = zip.getEntry(name);
        if (!entry || entry.header.size > 2 * 1024 * 1024) return null;
        return entry.getData().toString('utf-8');
      }
    });
  } catch {
    return { ...UNKNOWN };
  }
}
