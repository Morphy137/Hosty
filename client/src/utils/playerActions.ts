import type { PlayerActionSpec } from '../types/daemon';

/** Replaces `{{player}}` and `{{<param>}}` placeholders; unknown placeholders render empty. */
export function renderPlayerCommand(
  action: PlayerActionSpec,
  player: string,
  values: Record<string, string | number> = {}
): string {
  const variables: Record<string, string | number> = { ...values, player };
  return action.command
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => String(variables[key] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Expands an avatar URL template for a player (null when the game declares none). */
export function playerAvatarUrl(template: string | undefined, player: string): string | null {
  return template ? template.replace(/\{\{\s*player\s*\}\}/g, encodeURIComponent(player)) : null;
}
