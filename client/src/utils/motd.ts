export interface MotdSegment {
  text: string;
  /** CSS colour, undefined = default text colour. */
  color?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
}

/** Vanilla chat colours as rgb() so no hex literal leaks outside the design tokens. */
const COLORS: Record<string, string> = {
  '0': 'rgb(0,0,0)',
  '1': 'rgb(0,0,170)',
  '2': 'rgb(0,170,0)',
  '3': 'rgb(0,170,170)',
  '4': 'rgb(170,0,0)',
  '5': 'rgb(170,0,170)',
  '6': 'rgb(255,170,0)',
  '7': 'rgb(170,170,170)',
  '8': 'rgb(85,85,85)',
  '9': 'rgb(85,85,255)',
  a: 'rgb(85,255,85)',
  b: 'rgb(85,255,255)',
  c: 'rgb(255,85,85)',
  d: 'rgb(255,85,255)',
  e: 'rgb(255,255,85)',
  f: 'rgb(255,255,255)'
};

const FORMAT_MARKERS = /[§&]([0-9a-fk-or])/gi;

const resetStyle = (): Omit<MotdSegment, 'text'> => ({
  color: undefined,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false
});

/**
 * Splits a MOTD with Minecraft formatting codes (`§a` or `&a`) into styled segments.
 * Obfuscated (`k`) text is rendered as-is; a colour code also resets the previous format, like the game.
 */
export function parseMotd(input: string): MotdSegment[] {
  const segments: MotdSegment[] = [];
  let style = resetStyle();
  let cursor = 0;

  const pushText = (text: string) => {
    if (text) segments.push({ ...style, text });
  };

  for (const match of input.matchAll(FORMAT_MARKERS)) {
    pushText(input.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;

    const code = match[1].toLowerCase();
    if (code in COLORS) {
      style = { ...resetStyle(), color: COLORS[code] };
    } else if (code === 'l') {
      style = { ...style, bold: true };
    } else if (code === 'o') {
      style = { ...style, italic: true };
    } else if (code === 'n') {
      style = { ...style, underline: true };
    } else if (code === 'm') {
      style = { ...style, strikethrough: true };
    } else if (code === 'r') {
      style = resetStyle();
    }
  }
  pushText(input.slice(cursor));
  return segments;
}

/** Plain text of a MOTD without formatting codes. */
export function stripMotdCodes(input: string): string {
  return input.replace(FORMAT_MARKERS, '');
}

/** Segments of a MOTD: styled when the game uses formatting codes (manifest `motd.colorCodes`), plain otherwise. */
export function motdSegments(motd: string, colorCodes: boolean): MotdSegment[] {
  if (colorCodes) return parseMotd(motd);
  return motd ? [{ text: motd, bold: false, italic: false, underline: false, strikethrough: false }] : [];
}

/** Servers store line breaks as a literal backslash-n; single-line views show them as a separator space. */
export function flattenMotdLines(motd: string): string {
  return motd.replace(/\\n|\r?\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}
