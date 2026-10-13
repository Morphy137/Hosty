import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PropertiesParser } from '../src/parsers/PropertiesParser';

describe('PropertiesParser', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nexus-prop-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates default server.properties if not found', () => {
    const props = PropertiesParser.parseFile(tmpDir);
    expect(props.length).toBeGreaterThan(0);
    const motd = props.find((p) => p.key === 'motd');
    expect(motd?.value).toBe('MC-Nexus Local Server');
    expect(motd?.type).toBe('string');
  });

  it('parses boolean, number, and string types correctly', () => {
    const content = [
      '# Comment line',
      'online-mode=true',
      'server-port=25565',
      'motd=Hello World'
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'server.properties'), content, 'utf-8');

    const props = PropertiesParser.parseFile(tmpDir);
    expect(props).toEqual([
      { key: 'online-mode', value: true, type: 'boolean' },
      { key: 'server-port', value: 25565, type: 'number' },
      { key: 'motd', value: 'Hello World', type: 'string' }
    ]);
  });

  it('updates existing keys and appends new keys while preserving comments', () => {
    const initial = [
      '# Header comment',
      'motd=Old MOTD',
      'server-port=25565',
      '# Footer comment'
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'server.properties'), initial, 'utf-8');

    PropertiesParser.saveFile(tmpDir, {
      motd: 'New MOTD',
      'new-property': true
    });

    const updatedContent = fs.readFileSync(path.join(tmpDir, 'server.properties'), 'utf-8');
    expect(updatedContent).toContain('# Header comment');
    expect(updatedContent).toContain('motd=New MOTD');
    expect(updatedContent).toContain('server-port=25565');
    expect(updatedContent).toContain('# Footer comment');
    expect(updatedContent).toContain('new-property=true');
  });
});
