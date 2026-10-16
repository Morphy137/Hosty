import fs from 'fs';
import path from 'path';

const BACKUP_SUFFIX = '.bak';
const TEMP_SUFFIX = '.tmp';

export type JsonReadResult<T> =
  | { status: 'missing' }
  | { status: 'ok'; value: T; recovered: boolean }
  | { status: 'corrupt' };

const parseFile = <T>(file: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
};

/**
 * Reads a JSON file written by `writeJsonAtomic`. A damaged file falls back to the copy kept before the last
 * write (`recovered: true`); when neither can be parsed the caller gets `corrupt` instead of an empty value,
 * so it never mistakes lost data for defaults.
 */
export function readJsonFile<T>(file: string): JsonReadResult<T> {
  if (!fs.existsSync(file)) return { status: 'missing' };
  const value = parseFile<T>(file);
  if (value !== null) return { status: 'ok', value, recovered: false };
  const backup = parseFile<T>(`${file}${BACKUP_SUFFIX}`);
  return backup !== null ? { status: 'ok', value: backup, recovered: true } : { status: 'corrupt' };
}

/**
 * Writes JSON through a temporary file and a rename, so an interrupted write (crash, power loss) leaves either
 * the old or the new content, never a truncated file. The previous version is kept as `<file>.bak`.
 */
export function writeJsonAtomic(file: string, data: unknown, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}${TEMP_SUFFIX}`;
  const fd = fs.openSync(temp, 'w', mode);
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2), null, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  if (parseFile(file) !== null) fs.copyFileSync(file, `${file}${BACKUP_SUFFIX}`);
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    // Windows refuses the rename while another process (antivirus, indexer) holds the target open.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
    fs.copyFileSync(temp, file);
    fs.rmSync(temp, { force: true });
  }
}
