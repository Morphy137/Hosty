import fs from 'fs';
import path from 'path';

export interface PropertyItem {
  key: string;
  value: string | number | boolean;
  type: 'boolean' | 'number' | 'string';
}

export class PropertiesParser {
  public static parseFile(workingDir: string): PropertyItem[] {
    const filePath = path.join(workingDir, 'server.properties');
    if (!fs.existsSync(filePath)) {
      this.createDefaultProperties(filePath);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const items: PropertyItem[] = [];

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;

      const key = trimmed.slice(0, idx).trim();
      const rawVal = trimmed.slice(idx + 1).trim();

      if (rawVal === 'true' || rawVal === 'false') {
        items.push({ key, value: rawVal === 'true', type: 'boolean' });
      } else if (rawVal !== '' && !isNaN(Number(rawVal))) {
        items.push({ key, value: Number(rawVal), type: 'number' });
      } else {
        items.push({ key, value: rawVal, type: 'string' });
      }
    }

    return items;
  }

  public static saveFile(workingDir: string, updates: Record<string, string | number | boolean>): void {
    const filePath = path.join(workingDir, 'server.properties');
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      const idx = trimmed.indexOf('=');
      if (idx === -1) return line;

      const key = trimmed.slice(0, idx).trim();
      if (key in updates) {
        return `${key}=${updates[key]}`;
      }
      return line;
    });

    fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
  }

  private static createDefaultProperties(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const defaults = [
      '# Minecraft server properties',
      'motd=MC-Nexus Local Server',
      'server-port=25565',
      'max-players=20',
      'online-mode=true',
      'pvp=true',
      'difficulty=normal',
      'gamemode=survival',
      'view-distance=10',
      'simulation-distance=10',
      'allow-flight=false',
      'white-list=false',
      'spawn-protection=16'
    ].join('\n');
    fs.writeFileSync(filePath, defaults, 'utf-8');
  }
}