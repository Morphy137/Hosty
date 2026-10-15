import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface JavaEnvironmentInfo {
  detected: boolean;
  majorVersion: number | null;
  versionString: string | null;
  path: string;
  recommended: boolean;
  downloadUrl: string;
}

export interface SystemEnvironmentReport {
  java: JavaEnvironmentInfo;
}

export const ADOPTIUM_TEMURIN_URL = 'https://adoptium.net/temurin/releases/?version=21';

/**
 * Extracts the major version number from a java -version standard output string.
 * Supports legacy formats (e.g. "1.8.0_351" -> 8) and modern formats ("21.0.1" -> 21).
 */
export function parseJavaVersionString(output: string): number | null {
  const match = output.match(/(?:version|openjdk)\s+"(?:1\.)?(\d+)/i);
  if (!match || !match[1]) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Likely Java executables outside PATH. GUI-launched apps (macOS Finder, Linux desktop entries,
 * Windows services) often do not inherit the shell PATH, so `java` alone is not enough.
 */
export function javaCandidates(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  listDirs: (dir: string) => string[] = (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  }
): string[] {
  const exe = platform === 'win32' ? 'java.exe' : 'java';
  const candidates: string[] = [];
  if (env.JAVA_HOME) candidates.push(path.join(env.JAVA_HOME, 'bin', exe));

  const fromRoots = (roots: string[], suffix: string[]) => {
    for (const root of roots) {
      for (const entry of listDirs(root).sort().reverse()) {
        candidates.push(path.join(root, entry, ...suffix, exe));
      }
    }
  };

  if (platform === 'win32') {
    const programFiles = [env.ProgramFiles, env['ProgramFiles(x86)']].filter((value): value is string => Boolean(value));
    const vendors = ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'Semeru'];
    fromRoots(
      programFiles.flatMap((base) => vendors.map((vendor) => path.join(base, vendor))),
      ['bin']
    );
  } else if (platform === 'darwin') {
    fromRoots(['/Library/Java/JavaVirtualMachines'], ['Contents', 'Home', 'bin']);
    candidates.push('/opt/homebrew/opt/openjdk/bin/java', '/usr/local/opt/openjdk/bin/java');
  } else {
    fromRoots(['/usr/lib/jvm', '/usr/java', '/opt/java'], ['bin']);
  }
  return candidates;
}

/** Resolves the Java executable to launch with: the configured one if it works, otherwise a known install. */
export function resolveJavaExecutable(configured = 'java'): string {
  if (detectJavaEnvironment(configured).detected) return configured;
  // A custom path that does not work must not be silently replaced.
  if (configured !== 'java') return configured;
  for (const candidate of javaCandidates()) {
    if (fs.existsSync(candidate) && detectJavaEnvironment(candidate).detected) return candidate;
  }
  return configured;
}

/**
 * Checks if Java is installed and callable on the host machine.
 */
export function detectJavaEnvironment(executablePath = 'java'): JavaEnvironmentInfo {
  try {
    const result = spawnSync(executablePath, ['-version'], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true
    });

    if (result.error || (result.status !== 0 && result.status !== null)) {
      return {
        detected: false,
        majorVersion: null,
        versionString: null,
        path: executablePath,
        recommended: false,
        downloadUrl: ADOPTIUM_TEMURIN_URL
      };
    }

    const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    const majorVersion = parseJavaVersionString(output);

    return {
      detected: true,
      majorVersion,
      versionString: output.split('\n')[0]?.trim() || null,
      path: executablePath,
      recommended: majorVersion !== null && majorVersion >= 17,
      downloadUrl: ADOPTIUM_TEMURIN_URL
    };
  } catch {
    return {
      detected: false,
      majorVersion: null,
      versionString: null,
      path: executablePath,
      recommended: false,
      downloadUrl: ADOPTIUM_TEMURIN_URL
    };
  }
}
