import { describe, expect, it } from 'vitest';
import type { ModFileInfo } from '../src/types/daemon';
import { sortModFiles } from '../src/utils/modSort';

const mod = (originalName: string, sizeBytes: number, modifiedAt: string, enabled = true): ModFileInfo => ({
  filename: `${originalName}.jar`,
  originalName,
  sizeBytes,
  sizeFormatted: `${sizeBytes} B`,
  modifiedAt,
  enabled,
  hasConfig: false,
  configFiles: []
});

describe('sortModFiles', () => {
  const files = [
    mod('sodium', 300, '2026-03-01T00:00:00Z'),
    mod('Fabric API', 900, '2026-01-01T00:00:00Z', false),
    mod('lithium', 100, '2026-05-01T00:00:00Z')
  ];
  const names = (sorted: ModFileInfo[]) => sorted.map((file) => file.originalName);

  it('sorts by name, date, size and status without touching the input', () => {
    expect(names(sortModFiles(files, 'name_asc'))).toEqual(['Fabric API', 'lithium', 'sodium']);
    expect(names(sortModFiles(files, 'name_desc'))).toEqual(['sodium', 'lithium', 'Fabric API']);
    expect(names(sortModFiles(files, 'newest'))).toEqual(['lithium', 'sodium', 'Fabric API']);
    expect(names(sortModFiles(files, 'oldest'))).toEqual(['Fabric API', 'sodium', 'lithium']);
    expect(names(sortModFiles(files, 'size_desc'))).toEqual(['Fabric API', 'sodium', 'lithium']);
    expect(names(sortModFiles(files, 'size_asc'))).toEqual(['lithium', 'sodium', 'Fabric API']);
    expect(names(sortModFiles(files, 'enabled_first'))).toEqual(['lithium', 'sodium', 'Fabric API']);
    expect(names(files)).toEqual(['sodium', 'Fabric API', 'lithium']);
  });
});
