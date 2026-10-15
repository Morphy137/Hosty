# Hosty bridge protocol (v1)

A **bridge** is a small component that runs inside a game server (a plugin, a mod, a script) and
talks to the Hosty daemon to expose live telemetry and admin actions. The Minecraft bridges
(`bridge/paper`, `bridge/fabric`) are the reference implementations; anyone can write one for another game
by following this document. Frames are JSON text messages over a WebSocket.

- JSON Schema: [`packages/bridge-protocol/schema/bridge-v1.schema.json`](../packages/bridge-protocol/schema/bridge-v1.schema.json)
- CLI to develop against: `hosty-bridge-tester` ([`packages/bridge-protocol`](../packages/bridge-protocol))
- Daemon implementation: `daemon/src/core/bridge/` (`protocolV1.ts`, `TelemetryBridgeManager.ts`, `BridgeAuth.ts`)

## 1. Connecting

Before a server starts, the daemon writes `<server folder>/.hosty/bridge.json`:

```json
{
  "protocolVersion": 1,
  "instanceId": "survival",
  "token": "64 hex chars, generated once per instance",
  "url": "ws://127.0.0.1:50985/telemetry/bridge"
}
```

The bridge reads it **every time it connects** (the daemon's port can change between runs) and opens a
WebSocket to `url`. The file is user-private (`0600` where supported); never log the token.

Reconnect with backoff when the socket closes. After a rejected handshake wait at least a minute before
retrying — the problem is a configuration one, not a network one.

## 2. Handshake

The first frame **must** be `HELLO`:

```jsonc
{
  "type": "HELLO",
  "protocolVersion": 1,
  "instanceId": "survival",
  "token": "<from bridge.json>",
  "game": "minecraft",
  "implementation": { "name": "hosty-bridge-paper", "version": "1.2.0" },
  "capabilities": ["telemetry.server", "telemetry.players", "inventory.view", "action.heal", "action.kick"],
  "customActions": [
    { "id": "spawn_boss", "label": { "en": "Spawn boss", "es": "Invocar jefe" },
      "params": [{ "id": "name", "type": "string" }] }
  ]
}
```

The daemon answers with `HELLO_ACK`:

```jsonc
{ "type": "HELLO_ACK", "ok": true, "protocolVersion": 1 }
{ "type": "HELLO_ACK", "ok": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

| Error code | Meaning |
|---|---|
| `UNAUTHORIZED` | Unknown instance, wrong token, or a legacy pre-v1 bridge. The socket is closed. |
| `UNSUPPORTED_VERSION` | `protocolVersion` is not supported by this daemon. |
| `INVALID_MESSAGE` | The first frame was not a valid `HELLO`. |

Nothing but `HELLO` is accepted before an accepted handshake.

### Capabilities

A bridge advertises exactly what it implements; **the UI enables only advertised features** and the daemon
never sends an action that was not advertised (it falls back to console commands where it can).

| Capability | Meaning |
|---|---|
| `telemetry.server` | Sends `server` metrics in `TELEMETRY`. |
| `telemetry.players` | Sends `players` in `TELEMETRY`. |
| `inventory.view` | Answers the `inventory_view` action with `INVENTORY`. |
| `action.<name>` | Implements the standard action `<name>` (below). |

Standard actions: `heal`, `damage`, `kill`, `kick`, `teleport`, `freeze`, `unfreeze`, `smite`, `give_exp`,
`mute`, `unmute`, `inventory_view` (advertised as `inventory.view`).

**Custom actions** declared in `customActions` can be sent by the UI with their `id`. Labels are text or a
language map so the interface can show buttons in the user's language.

## 3. Bridge → daemon frames

### `TELEMETRY` (about once per second)

```jsonc
{
  "type": "TELEMETRY",
  "server": { "tps": 19.9, "mspt": 11.3, "loadedChunks": 812, "entities": 240,
              "stats": { "anything": "game specific" } },
  "players": [
    { "id": "069a79f4-...", "name": "Steve", "ping": 32, "health": 18, "maxHealth": 20,
      "position": { "x": 10.5, "y": 64, "z": -3, "world": "minecraft:overworld" },
      "stats": { "food": 20, "gamemode": "survival", "isOp": false } }
  ]
}
```

Common fields are typed; everything game-specific goes in free-form `stats` (string, number or boolean).

### `INVENTORY` (answer to `inventory_view`)

```jsonc
{
  "type": "INVENTORY",
  "player": { "id": "069a79f4-...", "name": "Steve" },
  "containers": [
    { "id": "hotbar", "slots": [ { "index": 0, "itemId": "minecraft:stone", "count": 12,
                                   "meta": { "customName": "Bricks" } }, null ] }
  ]
}
```

Containers are generic lists of slots (`null` = empty). The Minecraft UI maps the ids `armor`, `offhand`,
`hotbar` and `main`; other games may use any ids. `icon` (URL / data URL) is optional.

### `RESULT` (outcome of an `ACTION`)

```json
{ "type": "RESULT", "actionId": "7d1c...", "success": false, "message": "Player is not online" }
```

## 4. Daemon → bridge frames

### `ACTION`

```jsonc
{
  "type": "ACTION",
  "actionId": "7d1c...",
  "action": "heal",
  "target": { "type": "player", "name": "Steve" },
  "params": { "amount": 10, "feed": true }
}
```

Run actions on the game's main thread and always answer with a `RESULT`.

| Action | `params` |
|---|---|
| `heal` | `amount?: number`, `feed?: boolean` |
| `damage` | `amount?: number` |
| `kick` | `reason?: string` |
| `teleport` | `targetPlayer?: string` or `x`, `y`, `z` |
| `give_exp` | `levels?: number`, `expType?: "levels"\|"points"`, `mode?: "add"\|"set"` |
| `freeze` | `frostEffect?: boolean` |
| others | none |

## 5. Transports

WebSocket is the default and the only transport implemented by the daemon today. Games whose scripting
cannot open sockets (e.g. Project Zomboid's Lua) have two designed alternatives that translate to the same
frames; they are **specified, not implemented yet**:

1. **RCON** — the daemon talks the game's RCON protocol (Project Zomboid, Valheim, ARK ship one) and maps
   `ACTION` to commands and log/RCON queries to `TELEMETRY`.
2. **File exchange** — the bridge appends JSON lines to `<server>/.hosty/out.jsonl` (bridge → daemon) and
   reads `<server>/.hosty/in.jsonl` (daemon → bridge). Each line is one frame; `HELLO` is the first line.

## 6. Security model

- The token is generated by the daemon, stored per instance, and compared in constant time.
- Pre-v1 bridges (`BRIDGE_HELLO`, no token) are rejected with a message in the server console telling the
  user to reinstall the bridge. `MC_NEXUS_ALLOW_LEGACY_BRIDGE=true` re-enables them for transitional setups.
- The UI ⇄ daemon channel is protected separately: the desktop shell generates a per-run API token
  (`MC_NEXUS_API_TOKEN`) that REST (`x-hosty-token` / bearer) and WebSocket (`?token=`) clients must present.
- The daemon only listens on `127.0.0.1`.

## 7. Building a bridge

1. Read `.hosty/bridge.json`, connect, send `HELLO`.
2. Develop against the simulator: `npx hosty-bridge-tester --dir ./my-server --instance dev --seconds 60`.
   It prints every frame, validates it against the JSON Schema and exits non-zero on invalid frames.
3. Validate saved frames: `hosty-bridge-tester --validate frames.json`.
4. Advertise only what you implement.

### Current implementations

| Bridge | Loader | Notes |
|---|---|---|
| `bridge/paper` | Paper, Purpur, Spigot (MC 1.16–1.21+) | Telemetry, all actions, inventory. Mute is implemented via a chat listener. |
| `bridge/fabric` | Fabric (1.20.x–1.21.x) | Telemetry, inventory and the actions that map to vanilla commands (no mute). |
| Forge / NeoForge | — | **Not available yet.** `POST /bridge/install` answers with a clear error. |
