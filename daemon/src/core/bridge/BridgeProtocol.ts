export interface BridgeServerTelemetry {
  tps: number;
  mspt: number;
  loadedChunks: number;
  entitiesCount: number;
}

export interface BridgePlayerTelemetry {
  uuid?: string;
  username: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  health?: number;
  maxHealth?: number;
  food?: number;
  ping?: number;
  gamemode?: string;
  isOp?: boolean;
  isFrozen?: boolean;
  isMuted?: boolean;
}

export interface InventorySlotItem {
  slot: number;
  id: string; // e.g. "minecraft:netherite_sword", "create:wrench"
  count: number;
  damage?: number;
  maxDamage?: number;
  customName?: string;
  enchantments?: Array<{ id: string; level: number }>;
}

export interface PlayerInventoryData {
  username: string;
  uuid?: string;
  armor: (InventorySlotItem | null)[]; // 4 slots: helmet, chestplate, leggings, boots
  offhand: InventorySlotItem | null;
  hotbar: (InventorySlotItem | null)[]; // 9 slots: 0 to 8
  inventory: (InventorySlotItem | null)[]; // 27 slots: 9 to 35
}

export type BridgeIncomingMessage =
  | {
      type: 'BRIDGE_HELLO';
      instanceId: string;
      loader?: string;
      version?: string;
      token?: string;
    }
  | {
      type: 'TICK_TELEMETRY';
      instanceId: string;
      server: BridgeServerTelemetry;
      players: BridgePlayerTelemetry[];
    }
  | {
      type: 'INVENTORY_DATA';
      instanceId: string;
      inventory: PlayerInventoryData;
    }
  | {
      type: 'ACTION_RESULT';
      instanceId: string;
      actionId?: string;
      success: boolean;
      message?: string;
      data?: unknown;
    };

export interface BridgeActionMessage {
  type: 'ACTION';
  actionId?: string;
  action:
    | 'HEAL'
    | 'DAMAGE'
    | 'KILL'
    | 'KICK'
    | 'TELEPORT'
    | 'INVENTORY_VIEW'
    | 'FREEZE'
    | 'UNFREEZE'
    | 'SMITE'
    | 'GIVE_EXP'
    | 'MUTE'
    | 'UNMUTE';
  username: string;
  amount?: number;
  feed?: boolean;
  reason?: string;
  levels?: number;
  expType?: 'levels' | 'points';
  mode?: 'add' | 'set';
  x?: number;
  y?: number;
  z?: number;
  dimension?: string;
  targetPlayer?: string;
}
