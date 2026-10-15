import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { fileManagerCommand, openFolder } from '../src/core/FolderOpener';

describe('FolderOpener', () => {
  it('uses the file manager of each platform', () => {
    expect(fileManagerCommand('win32')).toBe('explorer.exe');
    expect(fileManagerCommand('darwin')).toBe('open');
    expect(fileManagerCommand('linux')).toBe('xdg-open');
  });

  it('refuses paths that are not folders', () => {
    expect(() => openFolder(path.join(os.tmpdir(), 'hosty-missing-folder-xyz'))).toThrow(/not a folder/);
  });
});
