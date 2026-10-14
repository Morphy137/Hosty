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
  action: 'HEAL' | 'DAMAGE' | 'KILL' | 'KICK' | 'TELEPORT' | 'INVENTORY_VIEW';
  username: string;
  amount?: number;
  feed?: boolean;
  reason?: string;
  x?: number;
  y?: number;
  z?: number;
  dimension?: string;
}
