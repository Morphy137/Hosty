import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { availableTabs, resolveActiveTab } from '../src/utils/tabs';
import type { GameDriverSummary } from '../src/types/daemon';

const SRC_DIR = path.resolve(__dirname, '../src');

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
  });
}

describe('design tokens', () => {
  it('keeps hex colours inside index.css (use semantic utilities such as bg-surface instead)', () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC_DIR)) {
      if (file.endsWith('index.css')) continue;
      const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
          offenders.push(`${path.relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('does not use native <select> elements (use components/ui/Select)', () => {
    const offenders = listSourceFiles(SRC_DIR)
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => /<select[\s>]/.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(SRC_DIR, file));
    expect(offenders).toEqual([]);
  });
});

describe('capability-driven tabs', () => {
  const base: GameDriverSummary = {
    id: 'x',
    name: 'X',
    category: 'voxel',
    defaultPort: 1,
    defaultMaxPlayers: 1,
    executableName: 'x',
    supportsMods: true,
    modFormat: 'JAR',
    supportsCustomJava: true,
    configFileName: 'server.properties',
    badge: 'X',
    description: ''
  };

  it('shows every tab for a moddable game with server.properties', () => {
    expect(availableTabs(base)).toEqual(['overview', 'players', 'mod_files', 'mods', 'properties']);
  });

  it('hides mod and properties tabs when the driver lacks them', () => {
    const tabs = availableTabs({ ...base, supportsMods: false, configFileName: 'servertest.ini' });
    expect(tabs).toEqual(['overview', 'players']);
  });

  it('falls back to overview when the selected tab disappears', () => {
    expect(resolveActiveTab('mods', ['overview', 'players'])).toBe('overview');
    expect(resolveActiveTab('players', ['overview', 'players'])).toBe('players');
  });
});
