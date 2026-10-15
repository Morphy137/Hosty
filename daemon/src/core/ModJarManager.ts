import fs from 'fs';
import path from 'path';
import { DaemonError } from '../errors';

export interface ModFileInfo {
  filename: string;
  originalName: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
  enabled: boolean;
  hasConfig: boolean;
}

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

export interface ModLayout {
  modsDir: string;
  configDir: string;
}

export const DEFAULT_MOD_LAYOUT: ModLayout = { modsDir: 'mods', configDir: 'config' };

export class ModJarManager {
  public static validateModFilename(rawFilename: string): string {
    if (!rawFilename || typeof rawFilename !== 'string') {
      throw new DaemonError('INVALID_FILENAME', 'Filename is required.');
    }

    const base = path.basename(rawFilename.trim());
    if (base !== rawFilename.trim() || base.includes('..') || /[/\\]/.test(rawFilename)) {
      throw new DaemonError('INVALID_FILENAME', 'Path traversal is not allowed in filename.');
    }

    if (!base.endsWith('.jar') && !base.endsWith('.jar.disabled') && !base.endsWith('.jar.disable')) {
      throw new DaemonError('INVALID_FILENAME', 'Only .jar, .jar.disabled, and .jar.disable files are supported.');
    }

    return base;
  }

  public static listModFiles(instanceDir: string, layout: ModLayout = DEFAULT_MOD_LAYOUT): ModFileInfo[] {
    const modsDir = path.join(instanceDir, layout.modsDir);
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
      return [];
    }

    const configDir = path.join(instanceDir, layout.configDir);
    const existingConfigFiles = fs.existsSync(configDir) ? fs.readdirSync(configDir) : [];

    const files = fs.readdirSync(modsDir);
    const modItems: ModFileInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled') && !file.endsWith('.jar.disable')) continue;

      const fullPath = path.join(modsDir, file);
      const stat = fs.statSync(fullPath);
      const enabled = file.endsWith('.jar');
      const cleanModName = file.replace(/\.jar(\.(disabled|disable))?$/, '').toLowerCase();

      // Check if there is a config with matching prefix in config/
      const hasConfig = existingConfigFiles.some((cfg) => {
        const cleanCfgName = cfg.replace(/\.(toml|json)$/, '').toLowerCase();
        return cleanCfgName.includes(cleanModName) || cleanModName.includes(cleanCfgName);
      });

      modItems.push({
        filename: file,
        originalName: file.replace(/\.(disabled|disable)$/, ''),
        sizeBytes: stat.size,
        sizeFormatted: this.formatFileSize(stat.size),
        modifiedAt: stat.mtime.toISOString(),
        enabled,
        hasConfig
      });
    }

    // Sort active first, then alphabetically
    return modItems.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.filename.localeCompare(b.filename);
    });
  }

  public static toggleMod(instanceDir: string, rawFilename: string, layout: ModLayout = DEFAULT_MOD_LAYOUT): ModFileInfo {
    const safeFilename = this.validateModFilename(rawFilename);
    const modsDir = path.join(instanceDir, layout.modsDir);
    const currentPath = path.join(modsDir, safeFilename);

    if (!fs.existsSync(currentPath)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Mod file "${safeFilename}" was not found.`);
    }

    let targetFilename: string;
    if (safeFilename.endsWith('.disabled')) {
      targetFilename = safeFilename.slice(0, -'.disabled'.length);
    } else if (safeFilename.endsWith('.disable')) {
      targetFilename = safeFilename.slice(0, -'.disable'.length);
    } else {
      targetFilename = `${safeFilename}.disable`;
    }

    const targetPath = path.join(modsDir, targetFilename);
    if (fs.existsSync(targetPath)) {
      throw new DaemonError('INVALID_PAYLOAD', `Destination file "${targetFilename}" already exists.`);
    }

    fs.renameSync(currentPath, targetPath);

    const stat = fs.statSync(targetPath);
    const enabled = !targetFilename.endsWith('.disabled') && !targetFilename.endsWith('.disable');
    return {
      filename: targetFilename,
      originalName: targetFilename.replace(/\.(disabled|disable)$/, ''),
      sizeBytes: stat.size,
      sizeFormatted: this.formatFileSize(stat.size),
      modifiedAt: stat.mtime.toISOString(),
      enabled,
      hasConfig: false
    };
  }

  public static deleteMod(instanceDir: string, rawFilename: string, layout: ModLayout = DEFAULT_MOD_LAYOUT): void {
    const safeFilename = this.validateModFilename(rawFilename);
    const modsDir = path.join(instanceDir, layout.modsDir);
    const targetPath = path.join(modsDir, safeFilename);

    if (!fs.existsSync(targetPath)) {
      throw new DaemonError('CONFIG_NOT_FOUND', `Mod file "${safeFilename}" was not found.`);
    }

    fs.unlinkSync(targetPath);
  }

  private static formatFileSize(bytes: number): string {
    if (bytes < BYTES_PER_KB) return `${bytes} B`;
    if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
}
