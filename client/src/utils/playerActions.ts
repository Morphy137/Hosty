/** Expands an avatar URL template for a player (null when the game declares none). */
export function playerAvatarUrl(template: string | undefined, player: string): string | null {
  return template ? template.replace(/\{\{\s*player\s*\}\}/g, encodeURIComponent(player)) : null;
}
