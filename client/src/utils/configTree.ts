export type ConfigTreeNode = ConfigTreeFolder | ConfigTreeFile;

export interface ConfigTreeFolder {
  kind: 'folder';
  name: string;
  /** Folder path from the config root, `/` separated. */
  path: string;
  children: ConfigTreeNode[];
}

export interface ConfigTreeFile {
  kind: 'file';
  name: string;
  /** File path from the config root, `/` separated: the value the daemon expects. */
  path: string;
}

const PATH_SEPARATOR = '/';

const byName = (a: ConfigTreeNode, b: ConfigTreeNode): number => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const sortNodes = (nodes: ConfigTreeNode[]): void => {
  nodes.sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === 'folder' ? -1 : 1));
  for (const node of nodes) if (node.kind === 'folder') sortNodes(node.children);
};

/** Folders first, then loose files, each sorted by name: the same layout as the config folder on disk. */
export function buildConfigTree(paths: string[]): ConfigTreeNode[] {
  const root: ConfigTreeNode[] = [];
  const folders = new Map<string, ConfigTreeFolder>();

  for (const filePath of paths) {
    const segments = filePath.split(PATH_SEPARATOR);
    let siblings = root;
    segments.slice(0, -1).forEach((segment, index) => {
      const folderPath = segments.slice(0, index + 1).join(PATH_SEPARATOR);
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = { kind: 'folder', name: segment, path: folderPath, children: [] };
        folders.set(folderPath, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    });
    siblings.push({ kind: 'file', name: segments[segments.length - 1], path: filePath });
  }

  sortNodes(root);
  return root;
}

/** Every folder that has to be open for `filePath` to be visible. */
export function ancestorFolders(filePath: string): string[] {
  const segments = filePath.split(PATH_SEPARATOR);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join(PATH_SEPARATOR));
}

/** Files whose path contains the search text (case-insensitive); everything when the search is empty. */
export function filterConfigPaths(paths: string[], search: string): string[] {
  const needle = search.trim().toLowerCase();
  return needle ? paths.filter((candidate) => candidate.toLowerCase().includes(needle)) : paths;
}
