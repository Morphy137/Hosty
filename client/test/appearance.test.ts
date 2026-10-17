// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  CONSOLE_FONT_STACKS,
  applyAppearance,
  customAccentVariables,
  resolveAppearance,
  resolveConsoleTheme
} from '../src/settings/appearance';
import { contrastRatio, formatColor, parseColor, readableVariant } from '../src/settings/color';
import { normalizePreferences } from '../src/settings/schema';

describe('resolveAppearance', () => {
  it('follows the system in system mode and the choice otherwise', () => {
    const system = normalizePreferences({ appearance: { mode: 'system' } });
    expect(resolveAppearance(system, true).dark).toBe(true);
    expect(resolveAppearance(system, false).dark).toBe(false);
    expect(resolveAppearance(normalizePreferences({ appearance: { mode: 'light' } }), true).dark).toBe(false);
  });

  it('maps preferences to data attributes, variables and zoom', () => {
    const prefs = normalizePreferences({
      appearance: { mode: 'dark', theme: 'midnight', accent: 'violet', density: 'compact', uiScale: 110, motion: 'reduced' },
      terminal: { theme: 'solar', font: 'consolas', fontSize: 15, lineHeight: 1.4 }
    });
    const resolved = resolveAppearance(prefs, false);
    expect(resolved.attributes).toEqual({
      'data-theme': 'midnight',
      'data-accent': 'violet',
      'data-density': 'compact',
      'data-motion': 'reduced',
      'data-console-theme': 'solar'
    });
    expect(resolved.variables).toMatchObject({
      '--console-font': CONSOLE_FONT_STACKS.consolas,
      '--console-font-size': '15px',
      '--console-line-height': '1.4'
    });
    expect(resolved.zoom).toBeCloseTo(1.1);
  });

  it('applies only the token overrides of the active mode', () => {
    const prefs = normalizePreferences({
      appearance: { mode: 'dark', tokenOverrides: { light: { surface: '#eeeeee' }, dark: { surface: '#101010' } } }
    });
    expect(resolveAppearance(prefs, false).variables['--surface']).toBe('#101010');
  });

  it('uses the blue accent attribute until a custom colour is picked', () => {
    const empty = resolveAppearance(normalizePreferences({ appearance: { accent: 'custom', customAccent: '' } }), false);
    expect(empty.attributes['data-accent']).toBe('blue');
    expect(empty.customAccent).toBeNull();
    const picked = resolveAppearance(normalizePreferences({ appearance: { accent: 'custom', customAccent: '#ff0088' } }), false);
    expect(picked.attributes['data-accent']).toBe('custom');
    expect(picked.customAccent).toBe('#ff0088');
  });

  it('resolves the "follow app" terminal theme per mode', () => {
    expect(resolveConsoleTheme('app', true)).toBe('hosty');
    expect(resolveConsoleTheme('app', false)).toBe('paper');
    expect(resolveConsoleTheme('glacier', false)).toBe('glacier');
  });
});

describe('applyAppearance', () => {
  it('writes the class, attributes and variables and removes stale ones', () => {
    const root = document.createElement('html');
    const first = resolveAppearance(
      normalizePreferences({ appearance: { mode: 'dark', tokenOverrides: { light: {}, dark: { ink: '#abcdef' } } } }),
      false
    );
    applyAppearance(first, root);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.getAttribute('data-theme')).toBe('hosty');
    expect(root.style.getPropertyValue('--ink')).toBe('#abcdef');

    applyAppearance(resolveAppearance(normalizePreferences({ appearance: { mode: 'light' } }), false), root);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--ink')).toBe('');
  });
});

describe('colour helpers', () => {
  it('parses and formats hex colours', () => {
    expect(parseColor('#0af')).toEqual([0, 170, 255]);
    expect(parseColor('12ab34')).toEqual([18, 171, 52]);
    expect(parseColor('red')).toBeNull();
    expect(formatColor([255, 0, 16])).toBe('#ff0010');
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([10, 10, 10], [10, 10, 10])).toBeCloseTo(1);
  });

  it('adjusts a custom accent until its text variant is readable on the surface', () => {
    const yellow = parseColor('#ffee00')!;
    const white = parseColor('#ffffff')!;
    const black = parseColor('#0d0d0d')!;
    expect(contrastRatio(readableVariant(yellow, white), white)).toBeGreaterThanOrEqual(4.5);
    expect(readableVariant(yellow, black)).toEqual(yellow);

    const variables = customAccentVariables('#ffee00', '#ffffff');
    expect(variables['--accent']).toBe('#ffee00');
    expect(variables['--accent-fg']).not.toBe('#ffee00');
    expect(variables['--on-accent']).toBe('#000000');
  });
});
