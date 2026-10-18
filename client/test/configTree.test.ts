import { describe, expect, it } from 'vitest';
import { ancestorFolders, buildConfigTree, filterConfigPaths } from '../src/utils/configTree';

describe('buildConfigTree', () => {
  it('nests files in their folders, folders first and both sorted', () => {
    const tree = buildConfigTree(['zeta.toml', 'sodium/options.json', 'create/deep/client.cfg', 'Alpha.json', 'create/common.toml']);

    expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual([
      'folder:create',
      'folder:sodium',
      'file:Alpha.json',
      'file:zeta.toml'
    ]);
    const create = tree[0];
    expect(create.kind === 'folder' && create.children.map((node) => `${node.kind}:${node.path}`)).toEqual([
      'folder:create/deep',
      'file:create/common.toml'
    ]);
  });

  it('returns an empty tree for no files', () => {
    expect(buildConfigTree([])).toEqual([]);
  });
});

describe('ancestorFolders', () => {
  it('lists every folder on the way to a file', () => {
    expect(ancestorFolders('a/b/c.toml')).toEqual(['a', 'a/b']);
    expect(ancestorFolders('root.toml')).toEqual([]);
  });
});

describe('filterConfigPaths', () => {
  it('matches on the whole path, ignoring case', () => {
    const paths = ['sodium/options.json', 'create/client.toml'];
    expect(filterConfigPaths(paths, ' SODIUM ')).toEqual(['sodium/options.json']);
    expect(filterConfigPaths(paths, '')).toEqual(paths);
  });
});
