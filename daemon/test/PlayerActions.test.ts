import { describe, expect, it } from 'vitest';
import { renderActionCommands, sanitizeActionValues, toBridgeAction } from '../src/core/PlayerActions';
import type { PlayerActionSpec } from '../src/core/gamepacks/manifest';

const kick: PlayerActionSpec = {
  id: 'kick',
  label: 'Kick',
  command: 'kick {{player}} {{reason}}',
  bridgeAction: 'KICK',
  params: [{ id: 'reason', label: 'Reason', type: 'text', default: 'Bye' }]
};

describe('player actions', () => {
  it('renders one or several commands with the player and parameters', () => {
    expect(renderActionCommands(kick, 'Steve', { reason: 'AFK' })).toEqual(['kick Steve AFK']);
    expect(renderActionCommands({ ...kick, command: ['a {{player}}', 'b {{player}} {{missing}}'] }, 'Alex')).toEqual([
      'a Alex',
      'b Alex'
    ]);
    expect(renderActionCommands({ id: 'x', label: 'X', bridgeAction: 'SMITE' }, 'Alex')).toEqual([]);
  });

  it('never lets a value add a second console line', () => {
    const values = sanitizeActionValues(kick, { reason: 'bye\nstop', extra: 'ignored' });
    expect(values).toEqual({ reason: 'bye stop' });
    expect(renderActionCommands(kick, 'Steve\nop Evil', values)).toEqual(['kick Steve op Evil bye stop']);
  });

  it('types numbers, checks select options and falls back to defaults', () => {
    const spec: PlayerActionSpec = {
      id: 'xp',
      label: 'XP',
      command: 'xp {{amount}} {{mode}}',
      params: [
        { id: 'amount', label: 'Amount', type: 'number' },
        { id: 'mode', label: 'Mode', type: 'select', options: [{ value: 'add', label: 'Add' }] }
      ]
    };
    expect(sanitizeActionValues(spec, { amount: '5', mode: 'add' })).toEqual({ amount: 5, mode: 'add' });
    expect(sanitizeActionValues(spec, { amount: 'abc', mode: 'delete' })).toEqual({});
    expect(sanitizeActionValues(kick, {})).toEqual({ reason: 'Bye' });
  });

  it('builds the bridge message from the declared bridge action', () => {
    expect(toBridgeAction(kick, 'Steve', { reason: 'AFK' })).toEqual({ action: 'KICK', username: 'Steve', reason: 'AFK' });
  });
});
