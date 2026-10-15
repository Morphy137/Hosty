import path from 'path';
import { describe, it, expect } from 'vitest';
import { parseJavaVersionString, detectJavaEnvironment } from '../src/core/EnvironmentDetector';

describe('EnvironmentDetector', () => {
  describe('parseJavaVersionString', () => {
    it('parses modern Java 21 string', () => {
      const output = 'openjdk version "21.0.12.1" 2026-08-18 LTS\nOpenJDK Runtime Environment';
      expect(parseJavaVersionString(output)).toBe(21);
    });

    it('parses Java 17 string', () => {
      const output = 'java version "17.0.9" 2023-10-17 LTS';
      expect(parseJavaVersionString(output)).toBe(17);
    });

    it('parses legacy Java 1.8 string', () => {
      const output = 'java version "1.8.0_351"';
      expect(parseJavaVersionString(output)).toBe(8);
    });

    it('returns null on unparseable string', () => {
      const output = 'some random error output';
      expect(parseJavaVersionString(output)).toBeNull();
    });
  });

  describe('detectJavaEnvironment', () => {
    it('gracefully handles non-existent binary', () => {
      const result = detectJavaEnvironment('non_existent_java_binary_12345');
      expect(result.detected).toBe(false);
      expect(result.majorVersion).toBeNull();
      expect(result.recommended).toBe(false);
      expect(result.downloadUrl).toContain('adoptium.net');
    });

    it('detects system java if available', () => {
      const result = detectJavaEnvironment('java');
      // If JDK 21 is installed on this test machine, check values
      if (result.detected) {
        expect(result.majorVersion).toBeGreaterThanOrEqual(8);
        expect(result.downloadUrl).toContain('adoptium.net');
      } else {
        expect(result.detected).toBe(false);
      }
    });
  });
});

describe('cross-platform Java discovery', () => {
  it('lists JAVA_HOME first and vendor folders newest first on Windows', async () => {
    const { javaCandidates } = await import('../src/core/EnvironmentDetector');
    const adoptium = path.join('/pf', 'Eclipse Adoptium');
    const list = javaCandidates(
      { JAVA_HOME: '/jdk', ProgramFiles: '/pf' },
      'win32',
      (dir) => (dir === adoptium ? ['jdk-17.0.9', 'jdk-21.0.4'] : [])
    );
    expect(list[0]).toBe(path.join('/jdk', 'bin', 'java.exe'));
    expect(list[1]).toBe(path.join(adoptium, 'jdk-21.0.4', 'bin', 'java.exe'));
    expect(list[2]).toBe(path.join(adoptium, 'jdk-17.0.9', 'bin', 'java.exe'));
  });

  it('knows macOS and Linux locations', async () => {
    const { javaCandidates } = await import('../src/core/EnvironmentDetector');
    const mac = javaCandidates({}, 'darwin', (dir) => (dir === '/Library/Java/JavaVirtualMachines' ? ['temurin-21.jdk'] : []));
    expect(mac[0]).toBe(path.join('/Library/Java/JavaVirtualMachines', 'temurin-21.jdk', 'Contents', 'Home', 'bin', 'java'));
    expect(mac).toContain('/opt/homebrew/opt/openjdk/bin/java');

    const linux = javaCandidates({}, 'linux', (dir) => (dir === '/usr/lib/jvm' ? ['java-21-openjdk-amd64'] : []));
    expect(linux[0]).toBe(path.join('/usr/lib/jvm', 'java-21-openjdk-amd64', 'bin', 'java'));
  });
});
