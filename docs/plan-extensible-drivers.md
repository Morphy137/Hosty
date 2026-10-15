# Plan: extensible drivers (0.3.0) — Minecraft as a regular game

## Context

Minecraft is the only game implemented as code (`MinecraftDriver`) and several core files branch on
`gameId === 'minecraft'`. The goal is that **no core, wizard or daemon file knows about a specific game**:
everything a game needs is either declared in its manifest (`hosty-game.json`) or provided through an
optional driver hook. Minecraft then becomes "just another game" described by a manifest plus a thin code
layer for the few things data cannot express.

## What was coupled (verified)

| Where | Coupling | Replaced by |
|---|---|---|
| `GameDriverRegistry` | `defaultDriverId = 'minecraft'` | `getDefaultGameId()` (first built-in / configurable) |
| `InstanceManager.createInstance` | writes `server.properties` for `minecraft` | driver hook `scaffoldInstance`, generic `configSync` |
| `InstanceManager.updateInstanceSettings` | syncs port/motd/max-players into `server.properties` | `configSync` (`file`, `format`, `map`) |
| `InstanceManager.inspectInstance` | reads `server.properties` for `minecraft` | `configSync` read side |
| `InstanceManager` | `bridgeSupported` = minecraft + loader list | driver `bridgeLoaders` |
| `FolderInspector` | loader/version detection and `server.properties` fallback | driver hook `inspectFolder`, manifest `detect` |
| `MinecraftDriver` | Forge/NeoForge `*_args.txt` discovery | manifest `launch.discover` |
| `MinecraftDriver` | `data get entity` position polling | manifest `playerQueries` |
| `MinecraftDriver` | JVM presets, default RAM, Modrinth source | manifest data (`jvmFlagPresets`, `defaults.memoryMb`, `modSources`) |
| Wizard / Customize step | `configFileName === 'server.properties'` | `capabilities` / `configSync` |

## New manifest surface (all additive, `apiVersion: 1`)

```jsonc
{
  "defaults": { "port": 25565, "maxPlayers": 20, "memoryMb": 4096 },
  "launch": {
    "runtime": "java",
    "executable": "server.jar",
    "args": ["nogui"],
    // First matching entry wins. `{{match}}` is the matched path (relative, `/` separated).
    "discover": [
      { "glob": "libraries/net/neoforged/neoforge/*/win_args.txt", "platform": "win32",
        "args": [{ "arg": "@user_jvm_args.txt", "ifExists": "user_jvm_args.txt" }, "@{{match}}", "nogui"] },
      { "glob": "forge-*.jar", "exclude": "installer", "mode": "jar", "args": ["nogui"] }
    ]
  },
  "playerQueries": [
    { "id": "pos", "command": "data get entity {{player}} Pos",
      "pattern": ":\\s(?<username>\\w{3,16}) has the following entity data: \\[(?<x>-?[\\d.]+)d, (?<y>-?[\\d.]+)d, (?<z>-?[\\d.]+)d\\]",
      "fields": { "x": "number", "y": "number", "z": "number" } }
  ],
  "configSync": { "file": "server.properties", "format": "properties",
                  "map": { "port": "server-port", "motd": "motd", "maxPlayers": "max-players" } },
  "bridgeLoaders": ["paper", "purpur", "spigot", "fabric"],
  "jvmFlagPresets": [ /* id, label, description, flags, recommendedFor */ ],
  "modSources": [ /* catalog declarations, already supported by the daemon */ ],
  "setup": [ { "id": "install", "type": "custom", "component": "minecraft-install", "label": "..." } ]
}
```

Driver hooks (optional, for what data cannot express): `scaffoldInstance(dir, options)` and
`inspectFolder(dir)` returning `{ loader, version }`. `parseLogLine` and the install pipeline stay in code.

## Phases

1. **Core hooks and manifest surface** (this branch): the table above, with tests. Minecraft becomes a
   `builtin/minecraft.json` manifest plus a thin `MinecraftDriver` subclass (log parsing, folder inspection,
   default `server.properties`). Core and client lose every `'minecraft'` branch.
2. **Bundled, pre-approved packs** (next): ship Minecraft, Project Zomboid and Hytale as pack folders in the app
   resources that are loaded like user packs. Needs a "bundled" trust flag in `PackLoader` and a build step that
   compiles the thin Minecraft code layer to `driver.js`.
3. **Installer providers**: a registered, declared installer type (`download`, `java-installer`, `steamcmd`)
   so a pack can describe how its server binaries are obtained instead of relying on a client component.
4. **Generic config sync formats**: `ini` / `json` / `toml` next to `properties`.

## Out of scope for this branch

Hot-reloading drivers while servers run, a signed-pack store, and Project Zomboid build 42 (tracked
separately).

## Verification

- `npm test` (daemon + client), `npm run lint`, `npm run build`, Playwright E2E.
- New tests: manifest validation of every new field, `launch.discover` (Forge args file, legacy jar,
  `ifExists`), `playerQueries` round-trip, `configSync` read/write, registry default game, import detection
  through `inspectFolder`.
- Regression: existing Minecraft launch, import and wizard tests must pass unchanged.

## Status (branch `feature/extensible-drivers`)

Phase 1 is implemented: Minecraft is `builtin/minecraft.json` plus a thin `MinecraftDriver`; `launch.discover`,
`playerQueries`, `configSync`, `bridgeLoaders`, `defaults.memoryMb`, `jvmFlagPresets`, `modSources` and `custom`
setup fields exist in the daemon, the SDK types, the JSON schema and the docs. `InstanceManager`,
`FolderInspector`, the bridge route and the wizard no longer contain game checks (the only remaining game id is
the registry's configurable default). Phases 2-4 stay open.
