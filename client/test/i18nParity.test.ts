import { describe, it, expect } from 'vitest';
import en from '../src/i18n/locales/en.json';
import es from '../src/i18n/locales/es.json';

function extractLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(extractLeafKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe('i18n Key Parity', () => {
  it('ensures en.json and es.json have identical key sets', () => {
    const enKeys = extractLeafKeys(en);
    const esKeys = extractLeafKeys(es);

    const missingInEs = enKeys.filter((key) => !esKeys.includes(key));
    const missingInEn = esKeys.filter((key) => !enKeys.includes(key));

    expect(missingInEs).toEqual([]);
    expect(missingInEn).toEqual([]);
    expect(enKeys).toEqual(esKeys);
  });

  it('ensures no empty translation strings exist', () => {
    const checkNoEmptyValues = (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          expect(v.trim().length, `Empty string found at key ${k}`).toBeGreaterThan(0);
        } else if (v && typeof v === 'object') {
          checkNoEmptyValues(v as Record<string, unknown>);
        }
      }
    };

    checkNoEmptyValues(en);
    checkNoEmptyValues(es);
  });
});
