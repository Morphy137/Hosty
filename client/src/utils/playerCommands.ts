export const PLAYER_ACTIONS = ['HEAL', 'GIFT', 'DAMAGE', 'KILL', 'KICK'] as const;
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

const HEAL_EFFECT_DURATION_SECONDS = 1;
const HEAL_EFFECT_AMPLIFIER = 10;
const DAMAGE_AMOUNT = 4;
const GIFT_ITEM = 'minecraft:diamond';
const GIFT_ITEM_COUNT = 5;

/** Builds the Minecraft console command executed for a quick player action. */
export function buildPlayerCommand(action: PlayerAction, username: string, kickReason: string): string {
  switch (action) {
    case 'HEAL':
      return `effect give ${username} minecraft:instant_health ${HEAL_EFFECT_DURATION_SECONDS} ${HEAL_EFFECT_AMPLIFIER}`;
    case 'DAMAGE':
      return `damage ${username} ${DAMAGE_AMOUNT} minecraft:magic`;
    case 'KILL':
      return `kill ${username}`;
    case 'GIFT':
      return `give ${username} ${GIFT_ITEM} ${GIFT_ITEM_COUNT}`;
    case 'KICK':
      return `kick ${username} ${kickReason}`;
  }
}
