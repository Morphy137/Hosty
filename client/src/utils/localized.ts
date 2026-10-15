import type { LocalizedText } from '../types/daemon';

/** Picks the best translation of a pack-provided text for the UI language (falls back to English, then any). */
export function resolveLocalized(text: LocalizedText | undefined, language: string): string | undefined {
  if (text === undefined) return undefined;
  if (typeof text === 'string') return text;
  const short = language.split('-')[0];
  return text[language] ?? text[short] ?? text.en ?? Object.values(text)[0];
}
