import { describe, expect, it } from 'vitest';
import { playerAvatarUrl, renderPlayerCommand } from '../src/utils/playerActions';
import type { PlayerActionSpec } from '../src/types/daemon';

const kick: PlayerActionSpec = {
  id: 'kick',
  label: 'Kick',
  command: 'kick {{player}} {{reason}}',
  params: [{ id: 'reason', label: 'Reason', type: 'text' }]
};

describe('renderPlayerCommand', () => {
  it('fills the player and declared parameters', () => {
    expect(renderPlayerCommand(kick, 'Steve', { reason: 'AFK' })).toBe('kick Steve AFK');
  });

  it('renders unknown placeholders empty and collapses whitespace', () => {
    expect(renderPlayerCommand({ ...kick, command: 'ban {{player}} {{missing}}' }, 'Alex')).toBe('ban Alex');
  });
});

describe('playerAvatarUrl', () => {
  it('expands the template and encodes the name', () => {
    expect(playerAvatarUrl('https://img.example/{{player}}/40', 'A B')).toBe('https://img.example/A%20B/40');
    expect(playerAvatarUrl(undefined, 'Steve')).toBeNull();
  });
});
