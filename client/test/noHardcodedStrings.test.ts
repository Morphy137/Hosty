import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(__dirname, '../src');

/** Visible text that is intentionally not translated (product and game names, units, symbols). */
const ALLOWED_TEXT = new Set([
  'Hosty',
  'Minecraft',
  'Project Zomboid',
  'Hytale',
  'Fabric',
  'Paper',
  'PaperMC',
  'Purpur',
  'Forge',
  'NeoForge',
  'Spigot',
  'Vanilla',
  'SteamCMD',
  'Java',
  'GB',
  'MB',
  'TPS',
  'MSPT',
  'CPU',
  'RAM',
  'EN',
  'ES',
  'OP',
  'XP',
  'UUID',
  'MOTD',
  'PZ',
  'HY',
  'MC',
  'XYZ',
  'HLM',
  'CHS',
  'LEG',
  'BOT',
  'java',
  'exe',
  'localhost'
]);

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'label'];

function listTsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsxFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Text that is really code (ternaries, template literals, generics) caught by the text-node regex. */
const CODE_LIKE = /[()?`=;]|&&|\|\||=>/;

function isTranslatable(text: string): boolean {
  const trimmed = text.replace(/&[a-z]+;/gi, ' ').trim();
  if (CODE_LIKE.test(trimmed)) return false;
  // Technical samples (Windows paths, JVM flags) are the same in every language.
  if (/^[A-Za-z]:\\/.test(trimmed) || trimmed.startsWith('-X')) return false;
  if (!/[A-Za-z]{2,}/.test(trimmed)) return false;
  if (ALLOWED_TEXT.has(trimmed)) return false;
  // Pure punctuation/units around allowed tokens, e.g. "GB" or "RAM:"
  const words = trimmed.split(/[^A-Za-z]+/).filter(Boolean);
  return !words.every((word) => ALLOWED_TEXT.has(word));
}

function findHardcodedStrings(source: string): string[] {
  const code = stripComments(source);
  const findings: string[] = [];

  // JSX text nodes: >Some text< or >Some text{
  const textNode = />\s*([^<>{}=;()\n][^<>{}]*?)\s*(?=<|\{)/g;
  for (let match = textNode.exec(code); match; match = textNode.exec(code)) {
    const before = code.slice(Math.max(0, match.index - 1), match.index);
    if (before === '=') continue; // arrow function body
    if (isTranslatable(match[1])) findings.push(match[1].trim());
  }

  for (const attribute of ATTRIBUTES) {
    const pattern = new RegExp(`\\b${attribute}="([^"{}]+)"`, 'g');
    for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
      if (isTranslatable(match[1])) findings.push(`${attribute}="${match[1]}"`);
    }
  }

  return findings;
}

describe('UI strings', () => {
  it('does not render untranslated text in .tsx files (use t() with en/es keys)', () => {
    const offenders: string[] = [];
    for (const file of listTsxFiles(SRC_DIR)) {
      const relative = path.relative(SRC_DIR, file).replace(/\\/g, '/');
      for (const finding of findHardcodedStrings(fs.readFileSync(file, 'utf-8'))) {
        offenders.push(`${relative}: ${finding}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
