# Audit: game coupling after 0.2.1

Question: did the last releases hardcode game knowledge into the app, against the "games are add-ons" goal?
Method: searched `daemon/src`, `client/src`, tests, docs and config for game ids, loader names and
game-specific files (`minecraft`, `zomboid`, `hytale`, `server.properties`, `pzBranch`, loaders, console
commands). Findings are ranked by how much they block a game pack from being a first-class citizen.

## Verdict

Partly. The **core data path is now decoupled** (launch, log parsing, queries, config sync, bridge loaders,
presets, mod catalog, installers, logos, default RAM are declared in manifests; no `gameId ===` checks remain).
But several **Minecraft-specific features still live in generic code paths** and apply to any game that
declares the matching capability. They were not introduced by the 0.2.x work, but 0.2.x claimed the
decoupling and did not finish these.

Mistakes made during the 0.2.x work itself:

| # | Mistake | Status |
|---|---|---|
| M1 | `.gitignore` ignored every `games/` folder, so bundled logos were never committed (Linux/macOS release tests failed, and the Windows build only worked locally). | Fixed in `bf6a8d8`. |
| M2 | `POST /api/game-packs/reload` returned only user packs, so reloading hid the bundled games. | Fixed in `bf6a8d8` (+ regression test). |
| M3 | `GameLogo` fell back to the **Minecraft** icon for any unknown game and shipped hardcoded Minecraft/Zomboid/Hytale images. | Fixed: pack logos only, neutral icon otherwise; unused assets removed. |
| M4 | Fallback strings "Local Minecraft Server" and a `MyMinecraftServer` placeholder in generic screens. | Fixed. |
| M5 | The bridge-install route silently kept the old response shape in 0.2.0 (client always showed "ready"). | Fixed in 0.2.1 branch work. |
| M6 | Release workflow did not install `packages/*`, so tests failed on every tag since 0.1.3. | Fixed (`fix/release-workflow-deps`). |

## Remaining coupling

### A. Core behaviour that assumes Minecraft (high)

| Where | Problem | Proposed fix |
|---|---|---|
| `client`: `PlayerAdminModal`, `PlayerActionModal`, `PlayerExperienceModal`, `App.tsx` (`clear <player>`) | Player administration sends **Minecraft console commands** (`kick`, `ban`, `op`, `gamemode`, `tp`, `effect give`, `give`, `clear`). Any game that sets `capabilities.players` gets Minecraft's commands. | Manifest `playerActions`: `{ id, label, command, params }` rendered generically; Minecraft declares its set. |
| `client`: `DimensionIcon`, `ItemSlotIcon`, `PlayerInventoryModal`, `MotdPreview` | Minecraft textures/CDN and the multiplayer-list preview are used for every game's player/inventory/MOTD UI. | Gate by capability (`inventory`, `motdPreview`) and let the driver supply icon sources. |
| `daemon`: `/api/properties` | Edits `server.properties` for the active instance regardless of game. | Already superseded by the generic config-file editor; remove the route and the Properties tab special case. |
| `daemon`: `/api/mods/*`, `ModJarManager` | Assumes `.jar` files in `mods/` (+ `config/`). | Manifest `modFormat`/`modsDir`; extension filter from the driver. |
| `daemon`: `/api/provisioning/*`, `ServerInstaller`, `ModLoaderCatalog`, `JarInspector`; `client`: `MinecraftInstallStep`, `draft.minecraft`, `ServerLoader` types | Loader catalog, installers and the setup component are Minecraft-only but live in generic modules and routes. | Phase 3 follow-up: a declared `provision` of type `catalog` served by a provider registry; move the component behind the custom-component registry only. |
| `daemon`: `TelemetryBridgeManager`, bridge install route | The bridge protocol actions (heal, give, ...) and `plugins/`/`mods/` folders are Minecraft's. `bridgeLoaders` is declared, the rest is not. | Declare bridge artifact folders and supported actions in the manifest. |
| `daemon`: `InstanceManager` creates `mods/` and `config/` for every game; `pzBranch` is a first-class setting; `isConfiguredDirectory` checks `server.properties`/`server.jar`. | Minecraft and Project Zomboid specifics in the instance model. | Create only folders the driver declares; replace `pzBranch` by `gameConfig` (already stored there) and drop the legacy field after a migration. |
| `daemon`: `index.ts` upload-server-jar writes `eula.txt` + `server.properties` | Minecraft first-run files in a generic upload route. | Move into `scaffoldInstance`/driver hook. |

### B. Registry and naming (medium)

| Where | Problem | Proposed fix |
|---|---|---|
| `GameDriverRegistry.defaultDriverId = 'minecraft'` | The "default game" is a literal. | Manifest flag `"default": true` on one bundled pack (or config), no literal. |
| `BUNDLED_EXTENSIONS.minecraft` | Core imports `MinecraftDriver`. Acceptable as the single place for bundled code, but it is the reason Minecraft is not a pure pack. | Phase 2 follow-up: compile the extension to a `driver.js` shipped inside the pack and loaded as bundled-trusted. |
| `types/daemon.ts` `pzBranch?: 'stable' \| 'unstable'`, `wizardPlan`/`ReviewStep` read `setupValues.pzBranch` | Project Zomboid field name in generic wizard code. | Use the setup field's own id; map to `gameConfig` only. |
| i18n keys `create_server.game_*_desc`, `zomboid_*`, `hytale_*`, `wizard.game_desc.<id>` | Per-game strings in the app's locale files. | Descriptions come from the manifest (`descriptionI18n`); delete these keys. |
| Tauri CSP `connect-src` lists `meta.fabricmc.net`, `piston-meta.mojang.com`; client `fetchLoaderVersions` falls back to those hosts directly | Game-specific hosts in the shell config and the generic API module. | Route all catalogs through the daemon and drop the hosts from the CSP. |

### C. Acceptable / by design

- `MC_NEXUS_*` env names and `com.mcnexus.bridge` packages (legacy naming, documented in `AGENTS.md`).
- Dev-only mock telemetry in `daemon/src/index.ts` (`MOCK_PLAYERS`, inventories use Minecraft ids): disabled in
  production; should move to a fixture file but is not shipped behaviour.
- Tests and `docs/examples` naming real games (they exercise the manifest format).
- `ConfigSync`, `launch.discover`, `playerQueries`, `provision: download|steamcmd`, `jvmFlagPresets`,
  `modSources`: generic by construction.

## Recommended order

1. `playerActions` in the manifest (A-1): the largest user-visible leak; blocks any non-Minecraft game with players.
2. Remove `/api/properties` and the Properties-tab special case, `pzBranch`, per-game i18n strings (A-3, B-3, B-4).
3. Declared mods dir / extension and instance folders (A-4, A-7).
4. `default` flag and bundled `driver.js` (B-1, B-2); catalog provider (A-5); bridge declaration (A-6).
5. Capability-gated Minecraft visuals (A-2).

Each step is additive in the manifest and can ship behind the existing capabilities; the Minecraft pack gets the
new declarations so nothing changes for users.

## Follow-up status

Implemented after this audit (branch `fix/bundled-logos-reload-dialogs`):

| Finding | Result |
|---|---|
| A-1 player commands in the client | Done. `playerActions`, `playerView`, `quickCommands` and `creationSettings` are manifest data; the generic list/dialog render them. The rich Minecraft panels are only reachable through `playerPanel: "minecraft-players"` (bundled packs; user packs that set it are rejected). |
| A-3 `/api/properties` | Removed. The wizard writes creation settings through the generic config editor. |
| A-4 / A-7 folders and mods layout | Done. `instanceFolders`, `modLayout`; upload scaffolding goes through the driver's `scaffoldInstance` (default config + EULA live in the Minecraft extension). |
| A-6 bridge folders | Done. `bridgeTargets` per loader; core only copies the declared asset. |
| B-1 default game literal | Done. `default: true` on a bundled pack. |
| B-3 `pzBranch` | Done. `provision.branchField` + `gameConfig`; legacy `pzBranch` is migrated on read. |
| B-4 per-game i18n and CSP | Done. Descriptions come from manifests; Fabric/Mojang hosts removed from the CSP and the client's direct upstream fallback. |
| A-2 Minecraft visuals | Contained: textures, MOTD preview and the inventory modal are only used by the rich panel, the inventory bridge capability or games exposing a MOTD. |

Still open:

- The loader catalog (`/api/provisioning/*`, `ServerInstaller`, `MinecraftInstallStep`, `draft.loaderInstall`) is Minecraft-shaped.
  It is reached through a manifest-declared custom component, but the daemon routes are not game-declared yet.
- `TelemetryBridgeManager` actions/inventory shape remain Minecraft's (protocol v1).
- The `minecraft` bundled extension (`BUNDLED_EXTENSIONS`) is compiled into the daemon.
- `MotdPreview` styling is Minecraft's server list; it appears for any game that maps a MOTD.
