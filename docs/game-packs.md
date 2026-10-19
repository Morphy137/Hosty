# Game packs

A **game pack** teaches Hosty how to run a game. Most games need only a JSON manifest; a small optional
`driver.js` covers anything the manifest cannot express. Packs are loaded at startup from the games
folder, so adding a game never requires rebuilding Hosty.

- Games folder (Windows): `%APPDATA%\Hosty\games\<pack-id>\` — **Sidebar → Game packs** shows the exact path.
- Development: `<repo>/games/`, or any folder set with `MC_NEXUS_GAMES_DIR`.
- Minecraft, Project Zomboid and Hytale are ordinary packs: Hosty copies them into the games folder on first run (and upgrades them when the bundled version is higher). You can disable or uninstall them like any other pack; an uninstalled one is not copied back.
- Any change to a bundled pack (its manifest, assets or generated `driver.js`) needs a `version` bump, or installed copies never receive it. `daemon/game-packs.lock.json` records each pack's version and content hash; `test/PackLock.test.ts` fails on an unbumped change. After bumping, run `npm --prefix daemon run lock:games`.

```
my-game/
├─ hosty-game.json   # required
├─ logo.png          # optional, referenced from the manifest
└─ driver.js         # optional, needs the user's explicit trust
```

Scaffold one with `npm create hosty-game my-game` (or **Game packs → New pack from template** in the app, which
creates it directly in the games folder; **Open games folder** shows it). Check it with `npx hosty-pack validate my-game`
(the same rules the daemon applies), then install it and press **Reload packs**. Full examples live in [`docs/examples/valheim`](examples/valheim/hosty-game.json),
[`project-zomboid`](examples/project-zomboid/hosty-game.json) and [`hytale`](examples/hytale/hosty-game.json) (the built-in games
expressed as packs). Open the games folder from the Game packs dialog to use the installed manifests as templates.

## Manifest (`hosty-game.json`, `apiVersion: 1`)

JSON Schema: [`packages/game-sdk/hosty-game.schema.json`](../packages/game-sdk/hosty-game.schema.json). Types:
`@hosty/game-sdk`.

| Field | Required | Description |
|---|---|---|
| `apiVersion` | yes | Always `1`. Packs with another version are rejected with a clear error. |
| `id` | yes | 2–40 chars of `a-z`, `0-9`, `-`. Unique. |
| `name`, `version` | yes | Display name and pack version. |
| `description` | | Text or a language map `{ "en": "...", "es": "..." }`. |
| `logo` | | Relative path to an image inside the pack. |
| `status` | | `available` (default), `beta` or `coming_soon` (shown but not selectable). |
| `defaults` | yes | `{ "port": 27015, "maxPlayers": 16 }`. |
| `provision` | | How the server files are obtained: `{ "type": "none" }`, `{ "type": "steamcmd", "appId": 896660 }` (anonymous SteamCMD) or `{ "type": "download", "url": "https://...", "filename"?, "sha256"? }` (one verified https file). |
| `launch` | yes | `executable` (string or per-platform object, `a\|b` = fallbacks), `runtime` (`native` / `java`), `args`. |
| `detect` | | Files that mark an installed server; also used to recognise folders when importing. |
| `logs` | | Regex strings for `ready`, `join`, `leave` (player name in group `username`) and a `dimension` label. |
| `commands` | | `stop` (`"ctrl+c"` sends Ctrl+C) and `save` (`null` disables saving). |
| `configFiles` | | `{ path, format }` with format `properties`, `ini`, `json`, `toml` or `lines`. Editable ones appear in the **Config** tab. |
| `setup` | | Fields of the wizard's setup step: `select`, `text`, `secret`, `number`, `toggle`. Values are available as `{{fieldId}}` in `launch.args`. |
| `capabilities` | | `players`, `mods`, `configEditor`, `bridge` (booleans). They decide which tabs a server shows. |
| `i18n` | | Extra UI strings `{ "en": { "key": "text" } }`. |
| `launch.discover` | | Entry points only known after installation: `{ glob, platform?, exclude?, mode?, args?, variants? }`. First matching entry wins; when one entry matches several files (two installed versions), the most recently written one is used. `variants` limits an entry to those installed variants (loaders), so files left by a previous loader never win. `{{match}}` is the matched relative path; an arg `{ "arg", "ifExists" }` is included only when that file exists. |
| `playerQueries` | | Commands sent per online player: `{ id, command, pattern, fields }`. The answer's named groups (`username` + `fields`) update the player (e.g. position). |
| `configSync` | | `{ file, format: "properties"\|"ini"\|"json"\|"toml", map: { port, motd, maxPlayers } }` keeps those instance settings in a game config file and reads them back when importing. JSON/TOML keys are dotted paths (`server.port`), INI keys are `section.key`. |
| `bridgeLoaders` | | Loaders a Telemetry Bridge exists for; enables the bridge install flow. |
| `defaults.memoryMb` | | Default heap offered when creating a server ("Default: X GB"). |
| `defaults.portStride` | | Consecutive ports one server uses (default 1; e.g. 2 when it also listens on `port + 1`). New servers get port ranges that do not overlap. |
| `jvmFlagPresets` | | Recommended JVM flag sets shown in the server editor (`id`, `label`, `description`, `flags`, `recommendedFor`). |
| `serverIcon` | | `{ file, size }`: the icon the game itself shows (e.g. `server-icon.png`, 64). Hosty writes the user's icon there as a `size`×`size` PNG; without it the icon is only shown inside Hosty. |
| `modSources` | | Mod catalogs the server can search and install from (Modrinth-compatible API). |
| `instanceFolders` | | Folders created inside every new instance (e.g. `["mods", "config"]`); none by default. |
| `modLayout` | | `{ modsDir, configDir, fileTypes? }`: where the Mods tabs look (defaults `mods` / `config`) and which file extensions are mods (e.g. `[".jar"]`; empty = any file). |
| `bridgeTargets` | | Loader -> `{ dir, asset }` for the Telemetry Bridge install; `default` is the fallback. |
| `default` | | Marks the game used when none is chosen (else the first loaded game). |
| `provision.branchField` | | For `steamcmd`: id of the setup field whose value is the Steam beta branch. |
| `playerActions` | | Actions an operator can run on an online player: `{ id, label, command?, bridgeAction?, params?, danger?, quick?, icon? }`. `command` is one command or a list; `{{player}}` and `{{paramId}}` are replaced and params render as a form. When the Telemetry Bridge is connected and advertises `bridgeAction`, it runs the action instead (it receives the param values under their ids). `quick` actions appear on every player card and in the Overview; the rest in the player's menu. |
| `dimensions` | | Worlds players can be in: `{ id, label, aliases?, icon?, primary? }`. Labels and pack images (`icon`) are shown on cards and as filter chips; `primary` ones are always offered. |
| `performance.tickRate` | | Ticks per second the server targets: shows the TPS card (green/amber/red relative to it) when the bridge reports TPS; otherwise the Overview shows uptime. |
| `commands.listPlayers` | | Console command that prints who is online; offered as "Refresh list" in the Players tab. |
| `commands.broadcast` | | Console command that announces `{{message}}` to all players; used to warn before scheduled restarts. |
| `backup` | | `{ "paths": ["world", "config"] }`: instance-relative paths a backup zips. Without it the whole instance is backed up. |
| `creationSettings` | | Choices shown when creating a server and written to a config file: `{ id, label, type, options?, default?, file, key }`. |
| `quickCommands` | | `{ label, command }` shortcuts shown above the console. |
| `playerLists` | | Lists the server keeps in JSON files, shown as views of the Players tab: `{ id, label, file, key, add, remove, description?, icon?, details?, valueType?, reason?, toggle? }`. `file` is a JSON array; `key` is the field that identifies an entry and `details` the extra fields shown (`reason`, `created`, `level`...); `valueType` is `player` (default) or `ip`. While the server runs, changes are sent as the `add`/`remove` commands (`{{value}}`, plus `{{reason}}` when `reason` is true); while it is stopped, removals edit the file directly and adding waits for the server. `toggle: { configFile, key, on, off }` adds an on/off switch (e.g. whitelist enforcement): commands while running, the config key while stopped. |
| `playerView` | | What the player cards show: `dimensions`, `coordinates`, `vitals`, an `avatarUrl` template, inventory item images (`itemIconUrls` templates with `{{item}}` / `{{namespace}}`, limited to `itemNamespaces`) and `inventoryClearAction` (id of the action the inventory viewer offers). |
| `setup[].type: "custom"` | | Renders a component registered by the app (`component` id). `installer` is the generic server-software step driven by `installer`. |
| `installer` | | Packs whose `driver.js` implements an installer: `{ variants: [{ id, name, automatic, group?, url? }], defaultVariant?, fileTypes?, javaRequirements? }`. The wizard lists the variants, their versions (asked to the extension) or lets the user bring their own server file (`fileTypes`); `javaRequirements: { default, versions: [{ from, java }] }` drives the Java check. |
| `motd` | | `{ colorCodes?, preview? }` for games whose `configSync` maps a MOTD: `§`/`&` formatting codes and a server-list style preview with the icon. |
| `devMock` | | Development only: JSON file in the pack with sample `players` (and an `inventory`) used by "Simulate telemetry". |

### Launch placeholders

`{{id}}` `{{name}}` `{{port}}` `{{nextPort}}` (`port + 1`) `{{maxPlayers}}` `{{minRamMb}}` `{{maxRamMb}}` `{{ramMb}}`
`{{instanceDir}}` (absolute server folder, e.g. for a game's cache/data dir flag) plus every setup field id.
Unknown placeholders render as an empty string.

### Capabilities and the UI

The client never checks game ids. Tabs, the setup step and config editors come from the driver summary:

- **Players** tab ⇐ `capabilities.players`
- **Mods** tabs ⇐ `capabilities.mods`
- **Config** tab ⇐ `capabilities.configEditor` and a non-empty `configFiles`
- Setup step ⇐ `setup` fields (rendered generically)

## Optional code: `driver.js`

When a manifest is not enough, add a CommonJS `driver.js` that overrides individual methods:

```js
// driver.js
// No imports needed: the daemon passes everything in the context object.
/** @type {import('@hosty/game-sdk').DriverFactory} */
module.exports.createDriver = ({ manifest, packDir, base }) => ({
  // Extend instead of replace by calling the declarative base.
  buildLaunchPlan(config) {
    const plan = base.buildLaunchPlan(config);
    return { ...plan, args: [...plan.args, '-nographics'] };
  },
  parseLogLine(line) {
    return base.parseLogLine(line);
  }
});
```

`driver.js` is loaded with Node's `require` from the pack folder; it can use Node built-ins and files inside the pack, but not npm packages unless you bundle them into the file.

Overridable methods: `validateInstallation`, `buildLaunchPlan`, `buildStopCommand`, `buildSaveCommand`,
`parseLogLine`. Identity (`id`, `summary`) always comes from the manifest.

`createDriver` may also return a complete driver (for example a subclass of the declarative one, which is how Minecraft's `driver.js` is built); its installer (`installer`), `inspectFolder` and `scaffoldInstance` then apply too.

### Trust model

`driver.js` is arbitrary code with the same permissions as Hosty, so:

1. A pack with code is loaded **declaratively only** until the user presses **Trust** in *Game packs*.
2. Trust is bound to the SHA-256 of `driver.js` (`<games>/.trusted.json`); editing the file revokes it.
3. Invalid packs are listed with every validation error and are never executed.
4. The `driver.js` of games that ship with Hosty is approved automatically when the pack is copied to the games folder.

A curated community index (a `hosty-games` repository with reviewed packs, hashes and signatures) is the
intended next step; it is not part of this version.

## Catalog

The **Catalog** tab of *Game packs* lists the packs published in the signed `Hosty-Games` catalog and installs or
updates them in one click. A pack is installed only if the catalog index verifies against the public key built into
the app and every file matches the SHA-256 and size the index declares; a pack's `driver.js` from the catalog is
approved automatically because that signature covers its hash. Point the app to another catalog with
`MC_NEXUS_CATALOG_URL`. To publish packs, see [catalog/README.md](../catalog/README.md).

Set `author: { "name": "...", "url": "https://github.com/you" }` in your manifest so the cards show who made the pack.

## Testing a pack

```ts
import { createPackHarness } from '@hosty/game-sdk';
import manifest from './hosty-game.json';

const pack = createPackHarness(manifest as never);
test('detects joins', () => {
  expect(pack.parseLog('Got connection SteamID 123')?.playerJoin?.username).toBe('123');
  expect(pack.launchArgs({ port: 2456 })).toContain('2456');
});
```

## HTTP API (daemon)

| Route | Purpose |
|---|---|
| `GET /api/games` | Driver summaries (capabilities, setup schema, config files, status). |
| `GET /api/games/:id/logo` | Pack logo image. |
| `GET /api/games/:id/setup-schema` | Setup fields of a game. |
| `GET /api/game-packs`, `POST /api/game-packs/reload` | List / rescan packs. |
| `GET /api/catalog`, `POST /api/catalog/install` | Signed catalog (with installed and update state) / install or update a pack from it (`{ id }`). |
| `POST /api/game-packs/install` `{ path }` | Validate and copy a pack folder into the games folder (code is never auto-trusted). |
| `DELETE /api/game-packs/:id` | Uninstall an installed pack (refused while servers use it). |
| `GET /api/locales`, `GET /api/locales/:code` | UI translation packs: `<localesDir>/<code>.json` with optional `_meta.name`; partial packs fall back to English. |
| `POST /api/game-packs/:id/trust` | Approve the current `driver.js`. |
| `GET/POST /api/config-files[/entries?path=]` | Read and edit the declared config files. |
| `POST /api/instances/:id/provision` | SteamCMD install job for the instance. |
| `GET /api/games/:id/files?path=` | An image shipped inside the pack (dimension icons, ...). |
| `GET /api/games/:id/installer/versions/:variant` | Versions the game's installer offers for a variant. |
| `POST /api/games/:id/installer/inspect-file` | Identify an uploaded server file (variant, game version, installer or server). |
| `POST /api/provisioning/install` `{ variant, version, instanceId, settings }` | Install job through the game's installer. |
| `POST /api/instances/upload-server-file?instanceId=&variant=&gameVersion=` | Use the user's own server file (runs it first when it is an installer). |

## UI translation packs

Hosty ships pt-BR, pt-PT, es-ES, es-419, zh-CN and hi in `daemon/assets/locales` (bundled as app resources). Your own files in the
`locales` folder override them. Drop `<code>.json` files (e.g. `pt-BR.json`, `es-419.json`) into the `locales` folder next to the games
folder (`MC_NEXUS_LOCALES_DIR`). Copy `client/src/i18n/locales/en.json` as the template, add
`"_meta": { "name": "Português (Brasil)" }` and translate the keys you want; missing keys fall back to English.
Regional variants can set `"_meta": { "extends": "pt-BR" }` and list only the keys that differ.
The language picker (globe icon) lists them automatically.
