/** Small colour helpers for user-picked colours (`#rrggbb`): contrast checks and derived variants. */

export type Rgb = readonly [number, number, number];

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const HEX_COLOR = /^#?([0-9a-f]{6})$/i;
const SHORT_HEX_COLOR = /^#?([0-9a-f]{3})$/i;

/** WCAG AA minimum for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;
const MIX_STEPS = 20;

export function parseColor(value: string): Rgb | null {
  const trimmed = value.trim();
  const short = SHORT_HEX_COLOR.exec(trimmed);
  const full = HEX_COLOR.exec(trimmed);
  const hex = full?.[1] ?? (short ? [...short[1]].map((digit) => digit + digit).join('') : null);
  if (!hex) return null;
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

export function formatColor([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function mixColors(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) => from[index] + (to[index] - from[index]) * amount) as unknown as Rgb;
}

/**
 * Text variant of an accent that stays readable on `background`: darkened on light surfaces,
 * lightened on dark ones, by the smallest step that reaches the target contrast.
 */
export function readableVariant(accent: Rgb, background: Rgb, target = MIN_TEXT_CONTRAST): Rgb {
  if (contrastRatio(accent, background) >= target) return accent;
  const towards = relativeLuminance(background) > 0.5 ? BLACK : WHITE;
  for (let step = 1; step <= MIX_STEPS; step += 1) {
    const candidate = mixColors(accent, towards, step / MIX_STEPS);
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  return towards;
}

/** Text colour (black or white) that reads best on top of `background`. */
export function onColor(background: Rgb): Rgb {
  return contrastRatio(BLACK, background) >= contrastRatio(WHITE, background) ? BLACK : WHITE;
}
