import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from '../src/provisioning/download';
import { readJsonFile, writeJsonAtomic } from '../src/core/JsonStore';

const hooks = { onLog: () => undefined };
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

describe('downloadFile', () => {
  let dir: string;
  let dest: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-download-'));
    dest = path.join(dir, 'server.jar');
    fs.writeFileSync(dest, 'old server');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('replaces the target only after a complete download that matches its checksum', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('new server')));
    await downloadFile('https://example.test/server.jar', dest, hooks, { algorithm: 'sha256', hex: sha256('new server') });
    expect(fs.readFileSync(dest, 'utf-8')).toBe('new server');
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
  });

  it('keeps the current file when the checksum does not match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('tampered')));
    await expect(
      downloadFile('https://example.test/server.jar', dest, hooks, { algorithm: 'sha256', hex: sha256('new server') })
    ).rejects.toThrow(/checksum/);
    expect(fs.readFileSync(dest, 'utf-8')).toBe('old server');
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
  });

  it('keeps the current file when the download fails midway', async () => {
    const failing = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial'));
        controller.error(new Error('connection reset'));
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(failing)));
    await expect(downloadFile('https://example.test/server.jar', dest, hooks)).rejects.toThrow();
    expect(fs.readFileSync(dest, 'utf-8')).toBe('old server');
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
  });
});

describe('JsonStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-json-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps the previous version and recovers from a damaged file', () => {
    const file = path.join(dir, 'state.json');
    expect(readJsonFile(file)).toEqual({ status: 'missing' });

    writeJsonAtomic(file, { version: 1 });
    writeJsonAtomic(file, { version: 2 });
    expect(readJsonFile(file)).toEqual({ status: 'ok', value: { version: 2 }, recovered: false });

    fs.writeFileSync(file, '{"version": ');
    expect(readJsonFile(file)).toEqual({ status: 'ok', value: { version: 1 }, recovered: true });

    fs.writeFileSync(`${file}.bak`, '');
    expect(readJsonFile(file)).toEqual({ status: 'corrupt' });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });
});
