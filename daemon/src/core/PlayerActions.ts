import type { BridgeActionMessage } from './bridge/BridgeProtocol';
import type { PlayerActionSpec } from './gamepacks/manifest';

export type PlayerActionValues = Record<string, string | number | boolean>;

/** Console input must stay on one line: a value can never smuggle in a second command. */
const cleanValue = (value: unknown): string =>
  Array.from(String(value ?? ''), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : char;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

/** Keeps only the declared parameters, single-line and typed as declared. */
export function sanitizeActionValues(spec: PlayerActionSpec, raw: unknown): PlayerActionValues {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const values: PlayerActionValues = {};
  for (const param of spec.params ?? []) {
    const value = input[param.id] ?? param.default;
    if (value === undefined || value === '') continue;
    if (param.type === 'number') {
      const number = Number(value);
      if (Number.isFinite(number)) values[param.id] = number;
    } else if (param.type === 'select') {
      const allowed = (param.options ?? []).map((option) => option.value);
      const text = cleanValue(value);
      if (allowed.length === 0 || allowed.includes(text)) values[param.id] = text;
    } else {
      values[param.id] = cleanValue(value).slice(0, 200);
    }
  }
  return values;
}

/** Console commands of an action with `{{player}}` and `{{<param>}}` filled in (unknown placeholders render empty). */
export function renderActionCommands(spec: PlayerActionSpec, player: string, values: PlayerActionValues = {}): string[] {
  const templates = spec.command === undefined ? [] : Array.isArray(spec.command) ? spec.command : [spec.command];
  const variables: Record<string, string | number | boolean> = { ...values, player: cleanValue(player) };
  return templates
    .map((template) =>
      template
        .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => cleanValue(variables[key]))
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

/** Message for the Telemetry Bridge: the declared bridge action plus the parameter values under their ids. */
export function toBridgeAction(spec: PlayerActionSpec, player: string, values: PlayerActionValues): Omit<BridgeActionMessage, 'type'> {
  return { ...values, action: spec.bridgeAction, username: player } as unknown as Omit<BridgeActionMessage, 'type'>;
}
