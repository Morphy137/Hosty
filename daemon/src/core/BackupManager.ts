import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export const BACKUPS_DIR_NAME = path.join('.hosty', 'backups');
export const DEFAULT_BACKUPS_KEPT = 5;
const BACKUP_NAME_PATTERN = /^backup-[0-9TZ-]+(-[a-z0-9]+)?\.zip$/;
/** Never part of a backup: backups themselves and Hosty's own runtime state. */
const EXCLUDED_TOP_LEVEL = new Set(['.hosty']);

const isInside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export class BackupManager {
  constructor(private readonly instanceDir: string) {}

  private get backupsDir(): string {
    return path.join(this.instanceDir, BACKUPS_DIR_NAME);
  }

  public list(): BackupInfo[] {
    if (!fs.existsSync(this.backupsDir)) return [];
    return fs
      .readdirSync(this.backupsDir)
      .filter((name) => BACKUP_NAME_PATTERN.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(this.backupsDir, name));
        return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
  }

  /** Zips the declared paths (or the whole instance) and prunes old backups beyond `keep`. */
  public create(paths: string[] | undefined, keep = DEFAULT_BACKUPS_KEPT, tag?: string): BackupInfo {
    fs.mkdirSync(this.backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = tag ? `-${tag.replace(/[^a-z0-9]/gi, '').toLowerCase()}` : '';
    const name = `backup-${stamp}${suffix}.zip`;

    const zip = new AdmZip();
    const targets = paths && paths.length > 0 ? paths : fs.readdirSync(this.instanceDir).filter((entry) => !EXCLUDED_TOP_LEVEL.has(entry));
    for (const relative of targets) {
      const absolute = path.resolve(this.instanceDir, relative);
      if (!isInside(this.instanceDir, absolute) || !fs.existsSync(absolute)) continue;
      if (fs.statSync(absolute).isDirectory()) zip.addLocalFolder(absolute, relative.replace(/\\/g, '/'));
      else zip.addLocalFile(absolute, path.dirname(relative) === '.' ? '' : path.dirname(relative).replace(/\\/g, '/'));
    }
    zip.writeZip(path.join(this.backupsDir, name));
    this.prune(keep);

    const stat = fs.statSync(path.join(this.backupsDir, name));
    return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
  }

  /** Extracts a backup over the instance; the server must be stopped by the caller. */
  public restore(name: string): void {
    const file = this.resolveBackup(name);
    new AdmZip(file).extractAllTo(this.instanceDir, true);
  }

  public remove(name: string): void {
    fs.rmSync(this.resolveBackup(name), { force: true });
  }

  private prune(keep: number): void {
    for (const stale of this.list().slice(Math.max(1, keep))) {
      fs.rmSync(path.join(this.backupsDir, stale.name), { force: true });
    }
  }

  private resolveBackup(name: string): string {
    if (!BACKUP_NAME_PATTERN.test(name)) throw new Error('Invalid backup name.');
    const file = path.join(this.backupsDir, name);
    if (!fs.existsSync(file)) throw new Error(`Backup "${name}" does not exist.`);
    return file;
  }
}
