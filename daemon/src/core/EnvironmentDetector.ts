import { spawnSync } from 'child_process';

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
