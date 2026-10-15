import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = path.resolve(__dirname, '../assets/locales');
const EN_PATH = path.resolve(__dirname, '../../client/src/i18n/locales/en.json');
const FULL_PACKS = ['pt-BR', 'zh-CN', 'hi'];

const flatten = (value: unknown, prefix = ''): Record<string, string> => {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === '_meta') continue;
      Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
    }
  } else {
    out[prefix] = String(value);
  }
  return out;
};

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
const english = flatten(read(EN_PATH));
const placeholders = (text: string) => (text.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

describe('bundled locale packs', () => {
  const files = fs.readdirSync(LOCALES_DIR).filter((file) => file.endsWith('.json'));

  it('ships the announced languages', () => {
    const codes = files.map((file) => file.slice(0, -5));
    expect(codes).toEqual(expect.arrayContaining(['pt-BR', 'pt-PT', 'es-ES', 'es-419', 'zh-CN', 'hi']));
  });

  it.each(files)('%s only uses known keys and keeps interpolation placeholders', (file) => {
    const pack = read(path.join(LOCALES_DIR, file));
    expect(typeof (pack._meta as { name?: string })?.name).toBe('string');
    for (const [key, text] of Object.entries(flatten(pack))) {
      expect(english, `unknown key ${key} in ${file}`).toHaveProperty(key);
      expect(placeholders(text), `${file}: ${key}`).toEqual(placeholders(english[key]));
    }
  });

  it.each(FULL_PACKS)('%s translates every English key', (code) => {
    const pack = flatten(read(path.join(LOCALES_DIR, `${code}.json`)));
    const missing = Object.keys(english).filter((key) => !(key in pack));
    expect(missing).toEqual([]);
  });
});
