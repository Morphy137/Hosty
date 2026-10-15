# Game packs

A **game pack** teaches Hosty how to run a game. Most games need only a JSON manifest; a small optional
`driver.js` covers anything the manifest cannot express. Packs are loaded at startup from the games
folder, so adding a game never requires rebuilding Hosty.

- Games folder (Windows): `%APPDATA%\Hosty\games\<pack-id>\` — **Sidebar → Game packs** shows the exact path.
- Development: `<repo>/games/`, or any folder set with `MC_NEXUS_GAMES_DIR`.
- Built-in games (Minecraft, Project Zomboid, Hytale) use the same format and cannot be replaced by a pack.

```
my-game/
├─ hosty-game.json   # required
├─ logo.png          # optional, referenced from the manifest
└─ driver.js         # optional, needs the user's explicit trust
```

Scaffold one with `npm create hosty-game my-game`, then copy the folder into the games folder and press
**Reload packs**. A full example lives in [`docs/examples/valheim`](examples/valheim/hosty-game.json).

## Manifest (`hosty-game.json`, `apiVersion: 1`)

JSON Schema: [`packages/game-sdk/hosty-game.schema.json`](../packages/game-sdk/hosty-game.schema.json). Types:
`@hosty/game-sdk`.

| Field | Required | Description |
|---|---|---|
| `apiVersion` | yes | Always `1`. Packs with another version are rejected with a clear error. |
| `id` | yes | 2–40 chars of `a-z`, `0-9`, `-`. Unique; cannot reuse a built-in id. |
| `name`, `version` | yes | Display name and pack version. |
| `description` | | Text or a language map `{ "en": "...", "es": "..." }`. |
| `logo` | | Relative path to an image inside the pack. |
| `status` | | `available` (default), `beta` or `coming_soon` (shown but not selectable). |
| `defaults` | yes | `{ "port": 27015, "maxPlayers": 16 }`. |
| `provision` | | `{ "type": "none" }` or `{ "type": "steamcmd", "appId": 896660 }` (anonymous SteamCMD install). |
| `launch` | yes | `executable` (string or per-platform object, `a\|b` = fallbacks), `runtime` (`native` / `java`), `args`. |
| `detect` | | Files that mark an installed server; also used to recognise folders when importing. |
| `logs` | | Regex strings for `ready`, `join`, `leave` (player name in group `username`) and a `dimension` label. |
| `commands` | | `stop` (`"ctrl+c"` sends Ctrl+C) and `save` (`null` disables saving). |
| `configFiles` | | `{ path, format }` with format `properties`, `ini`, `json`, `toml` or `lines`. Editable ones appear in the **Config** tab. |
| `setup` | | Fields of the wizard's setup step: `select`, `text`, `secret`, `number`, `toggle`. Values are available as `{{fieldId}}` in `launch.args`. |
| `capabilities` | | `players`, `mods`, `configEditor`, `bridge` (booleans). They decide which tabs a server shows. |
| `i18n` | | Extra UI strings `{ "en": { "key": "text" } }`. |

### Launch placeholders

`{{id}}` `{{name}}` `{{port}}` `{{maxPlayers}}` `{{minRamMb}}` `{{maxRamMb}}` `{{ramMb}}` plus every setup field id.
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

### Trust model

`driver.js` is arbitrary code with the same permissions as Hosty, so:

1. A pack with code is loaded **declaratively only** until the user presses **Trust** in *Game packs*.
2. Trust is bound to the SHA-256 of `driver.js` (`<games>/.trusted.json`); editing the file revokes it.
3. Invalid packs are listed with every validation error and are never executed.

A curated community index (a `hosty-games` repository with reviewed packs, hashes and signatures) is the
intended next step; it is not part of this version.

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
| `GET /api/game-packs`, `POST /api/game-packs/reload` | List (built-ins first, read-only) / rescan packs. |
| `POST /api/game-packs/install` `{ path }` | Validate and copy a pack folder into the games folder (code is never auto-trusted). |
| `DELETE /api/game-packs/:id` | Uninstall an installed pack (refused while servers use it). |
| `GET /api/locales`, `GET /api/locales/:code` | UI translation packs: `<localesDir>/<code>.json` with optional `_meta.name`; partial packs fall back to English. |
| `POST /api/game-packs/:id/trust` | Approve the current `driver.js`. |
| `GET/POST /api/config-files[/entries?path=]` | Read and edit the declared config files. |
| `POST /api/instances/:id/provision` | SteamCMD install job for the instance. |

## UI translation packs

Hosty ships pt-BR, pt-PT, es-ES, es-419, zh-CN and hi in `daemon/assets/locales` (bundled as app resources). Your own files in the
`locales` folder override them. Drop `<code>.json` files (e.g. `pt-BR.json`, `es-419.json`) into the `locales` folder next to the games
folder (`MC_NEXUS_LOCALES_DIR`). Copy `client/src/i18n/locales/en.json` as the template, add
`"_meta": { "name": "Português (Brasil)" }` and translate the keys you want; missing keys fall back to English.
Regional variants can set `"_meta": { "extends": "pt-BR" }` and list only the keys that differ.
The language picker (globe icon) lists them automatically.
