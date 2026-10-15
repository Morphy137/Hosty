import { describe, expect, it } from 'vitest';
import { playerAvatarUrl } from '../src/utils/playerActions';
import { resolveDimension } from '../src/utils/dimensions';
import { actionIcon, PLAYER_ACTION_ICONS } from '../src/utils/actionIcons';
import type { GameDriverSummary } from '../src/types/daemon';

describe('playerAvatarUrl', () => {
  it('expands the template and encodes the name', () => {
    expect(playerAvatarUrl('https://img.example/{{player}}/40', 'A B')).toBe('https://img.example/A%20B/40');
    expect(playerAvatarUrl(undefined, 'Steve')).toBeNull();
  });
});

describe('resolveDimension', () => {
  const game = {
    id: 'demo',
    dimensions: [{ id: 'surface', label: { en: 'Surface', es: 'Superficie' }, aliases: ['demo:surface'], icon: 'icons/surface.png' }]
  } as unknown as GameDriverSummary;

  it('uses the declared label and icon for ids and aliases', () => {
    const dimension = resolveDimension(game, 'DEMO:SURFACE', 'es');
    expect(dimension).toMatchObject({ id: 'surface', label: 'Superficie' });
    expect(dimension.iconUrl).toContain('/api/games/demo/files?path=icons%2Fsurface.png');
  });

  it('gives unknown dimensions a readable name and no icon', () => {
    expect(resolveDimension(game, 'some_mod:deep_caverns', 'en')).toEqual({
      id: 'some_mod:deep_caverns',
      label: 'Deep Caverns',
      iconUrl: null
    });
    expect(resolveDimension(undefined, '', 'en').label).toBe('—');
  });
});

describe('actionIcon', () => {
  it('maps declared names and falls back for unknown ones', () => {
    expect(actionIcon('heart')).toBe(PLAYER_ACTION_ICONS.heart);
    expect(actionIcon('does-not-exist')).toBeDefined();
  });
});
