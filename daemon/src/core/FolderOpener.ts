import { spawn } from 'child_process';
import fs from 'fs';

/** Command that shows a folder in the OS file manager. */
export const fileManagerCommand = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? 'explorer.exe' : platform === 'darwin' ? 'open' : 'xdg-open';

/**
 * Opens a folder in the file manager of the machine running the daemon (always the user's own machine).
 * The process is detached so the daemon never waits on it; explorer.exe exits with 1 even on success.
 */
export function openFolder(dir: string, platform: NodeJS.Platform = process.platform): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`"${dir}" is not a folder.`);
  }
  const child = spawn(fileManagerCommand(platform), [dir], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => undefined);
  child.unref();
}
