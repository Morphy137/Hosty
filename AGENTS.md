# AGENTS.md

Project context for AI coding agents. The user-facing presentation lives in [README.md](README.md).

## Project overview

**Hosty** (repo/folder name: `mc-nexus`) is a desktop app (Windows is the supported platform; macOS/Linux builds exist in CI but are not validated yet, see [docs/releasing.md](docs/releasing.md)) to create and manage **local dedicated game servers** for **multiple games**. It is intentionally game-agnostic: each game is a pluggable driver, and new games are added over time. Minecraft is the most complete; Project Zomboid and Hytale have early drivers.

Naming note: the product is "Hosty", but legacy "MC-Nexus" naming remains in env vars (`MC_NEXUS_*`), Java packages (`com.mcnexus.bridge`) and bridge jar names. Do not rename without approval.

## Architecture

```
hosty/
├─ client/   React 19 + Vite + Tailwind CSS 4 + Tauri v2 (src-tauri/) frontend
├─ daemon/   Express 5 + ws process supervisor, game drivers, provisioning
├─ instances/ Runtime server data (gitignored: worlds, jars, logs)
└─ .github/workflows/release.yml  Tauri release build on `v*` tags
```

- **Client ⇄ daemon**: REST (`/api/...`) + WebSocket. Default daemon URL `http://localhost:4000` (`VITE_DAEMON_URL`, see `client/.env.example`). Dev client runs on `http://localhost:5173`.
- **Daemon ⇄ bridge**: protocol v1 over WebSocket (spec: [docs/bridge-protocol.md](docs/bridge-protocol.md), schema + tester in `packages/bridge-protocol`). The daemon writes `<instance>/.hosty/bridge.json` (url + per-instance token) before a server starts; the bridge sends `HELLO` with its capabilities and the UI only enables advertised features. Pre-v1 bridges are rejected. The bridge source lives in its own repository, [Hosty-Bridge](https://github.com/Morphy137/Hosty-Bridge); its built jars are vendored in `daemon/assets/bridge/` and are installed via `POST /api/instances/:id/bridge/install` (Paper/Purpur/Spigot/Fabric; none for Forge/NeoForge yet).
- **UI ⇄ daemon auth**: in the desktop app Rust generates `MC_NEXUS_API_TOKEN` per run and exposes it with `get_daemon_token`; REST uses `x-hosty-token`, WebSocket/`<img>` URLs use `?token=`.
- **Tauri shell** (`client/src-tauri`) wraps the frontend and supervises the daemon as a sidecar (`binaries/hosty-daemon-<triple>`, built by `npm --prefix daemon run build:sidecar` with esbuild + Node SEA). In release builds Rust picks the port (4000 or a free one), passes `MC_NEXUS_INSTANCE_DIR`/`MC_NEXUS_ASSETS_DIR`, exposes it via the `get_daemon_url` command and logs the sidecar to `app_log_dir/daemon.log`. On exit it writes `shutdown` to the sidecar stdin so Java servers stop gracefully. In `tauri dev` the sidecar is not spawned; run `npm run dev:daemon`.

### Daemon (`daemon/src`)

- `index.ts` — Express routes + WebSocket server. Route groups: `/api/health`, `/api/system/environment`, `/api/games`, `/api/instances/*` (select, create, import, settings, icon, open-folder, restart, console, bridge install, upload-server-file), `/api/games/:id/files|installer/*`, `/api/properties`, `/api/mods/files|configs`, `/api/provisioning/install|jobs`. Socket actions include `PLAYER_ACTION` (runs a declared player action: bridge or console commands) and `INVENTORY_VIEW`.
- `config/env.ts` — env loading/validation (`MC_NEXUS_PORT` default 4000, `_HOST`, `_ALLOWED_ORIGINS`, `_INSTANCE_DIR`, `_JAVA_PATH`, `_MIN/MAX_RAM_MB`, `_ENABLE_MOCK`, ...). Mock/simulated telemetry is enabled by default outside production.
- `core/drivers/` — **game driver abstraction**: `IGameDriver` (summary with capabilities/config files/setup schema, `validateInstallation`, `buildLaunchPlan`, stop/save commands, `parseLogLine`, optional query/position polling) registered in `GameDriverRegistry`. Every game is a manifest run by `core/gamepacks/DeclarativeDriver`; No game is built into the core: Minecraft, Project Zomboid and Hytale ship as packs in `daemon/assets/games/<id>/` and are copied into the games folder on first run (`core/gamepacks/PackSeeder`: copied once, upgraded when the bundled version is higher, never restored after the user uninstalls them). Minecraft's code (`extensions/minecraft`) is bundled by `npm --prefix daemon run build:games` into its pack's generated `driver.js`, which is trusted automatically because it ships with the app. Optional `IGameDriver.installer` (`GameInstaller`: list versions, install, inspect/place an uploaded file) backs the generic installer routes and wizard step. `core/gamepacks/PackLoader` loads every pack from `MC_NEXUS_GAMES_DIR` (trust-gated `driver.js`, which may return overrides or a complete driver); `core/catalog` reads the signed game catalog (`MC_NEXUS_CATALOG_URL`, default the `Hosty-Games` repository: `index.json` + Ed25519 `index.json.sig` checked against `catalogKey.ts`, every file checked against its SHA-256) behind `GET /api/catalog` and `POST /api/catalog/install`; the publishing tools are in `catalog/` (see its README). `ConfigFileEditor` edits the declared config files; `provisioning/SteamCmd` installs Steam games.
- `core/` — `InstanceManager` (instance CRUD/persistence), `ProcessSupervisor` + `SupervisorRegistry` (process lifecycle, metrics via `pidusage`), `LineBuffer`, `ModFileManager` (mod files per `modLayout`), `PlayerActions` (renders/sanitises declared player actions), `InstanceIcon`, `EnvironmentDetector` (Java detection), `bridge/` (`BridgeProtocol`, `TelemetryBridgeManager`).
- `extensions/minecraft/` — everything Minecraft-only: `MinecraftDriver` (log parsing, folder inspection, installer), `ServerInstaller` + `ModLoaderCatalog` (Paper/Purpur/Fabric/Vanilla downloads, Forge/NeoForge installers run with `--installServer`; Spigot stays manual), `JarInspector`, `JavaInstallerRunner`, `LogLineParser`, `PropertiesParser`. Forge/NeoForge launch via the generated `libraries/**/win_args.txt` (`launch.discover`).
- `parsers/` — mod config (TOML via `@iarna/toml`, etc.) parsing and update helpers.
- `provisioning/` — generic: `download.ts` (streamed downloads with progress), `ProvisionJobs` (background jobs: `POST /api/provisioning/install` returns `{ jobId }`, progress broadcast as `PROVISION_PROGRESS`, `GET /api/provisioning/jobs/:id`, `POST .../jobs/:id/cancel`), `InstallProviders` + `SteamCmd` (manifest `provision`), `ModCatalog` (manifest `modSources`).

### Client (`client/src`)

- `App.tsx` root; `components/{layout,tabs,modals,common}`; tabs: Overview, Players, Mods, Mod Configs, server.properties (+ Provisioning).
- **Settings** (`components/settings`, `settings/`): full-height view opened from the Sidebar gear or `Ctrl+,`. UI preferences are one versioned object (`settings/schema.ts`, `normalizePreferences` sanitises storage and imports) in `localStorage['hosty.preferences']` (legacy theme/language keys are migrated once), exposed by `PreferencesProvider`/`usePreferences`. `settings/appearance.ts` maps them to `<html>` attributes (`data-theme`, `data-accent`, `data-density`, `data-motion`, `data-console-theme`) and inline variables (token overrides, custom accent, console font); theme/accent/terminal presets live only in `index.css`. Rows are declared in `settings/registry.ts` (labels `settings.<section>.<id>.label|description`) and rendered by the section components. The console (`components/console`) uses the `--console-*` tokens. Daemon-side defaults for new servers (memory, Java, autostart) use `GET/PUT /api/settings` (`core/AppSettingsStore`, `<instances>/app-settings.json`); "start with the system" uses `tauri-plugin-autostart`.
- `hooks/` (data + socket + theme), `state/daemonSocketReducer.ts`, `api/daemonApi.ts`, `types/daemon.ts`, `utils/`.
- **i18n**: `i18n/locales/en.json` and `es.json`; parity enforced by `test/i18nParity.test.ts`.
- **Creation wizard** (`components/wizard`): origin (create/import) → game → setup → customize → install → done. Game cards come from `/api/games` (`status`: available/beta/coming_soon); the setup step renders the driver's `setupSchema` (`SchemaFields`) or a registered custom component (`steps/customSetupComponents.ts`: `installer`, the generic `InstallerStep` driven by the manifest `installer`). `wizardPlan.ts` maps the draft to the daemon operation (install / upload / create / import). Import uses `POST /api/instances/inspect-folder`; the daemon also exposes `GET /api/system/ports/:port`.
- **Design system**: colours are semantic tokens defined once in `src/index.css` (`bg-surface`, `text-ink`, `border-hairline`, ...; dark mode only swaps the variable values, so no `dark:` colour pairs). Hex colours outside `index.css` and native `<select>` fail `test/designSystem.test.ts`. Reusable primitives live in `components/ui/` (Button, IconButton, Input, Select, Dialog, Tabs, Badge, Tooltip, DropdownMenu, Toast, Skeleton, Stepper, Slider, Dropzone; Radix-based). Shell: `layout/TitleBar` (frameless window, Tauri only), `layout/Sidebar` (server list + settings), `layout/ServerHeader` (single Start/Stop button + menu); tabs come from driver capabilities (`utils/tabs.ts`). Players (tab, Overview, inventory) use the shared `components/players/*` driven by `playerActions`, `playerView`, `dimensions` and `performance` from the manifest; there is no per-game UI.
- Game logos in `public/logos` and `src/assets/logos`.

### Bridge (separate repository)

The in-game plugins (Paper/Purpur/Spigot plugin, Fabric mod) live in [Hosty-Bridge](https://github.com/Morphy137/Hosty-Bridge) (MIT) and implement protocol v1. This repo keeps the protocol spec and tester (`docs/bridge-protocol.md`, `packages/bridge-protocol`) as the contract. To update a bridge, build it in that repo and copy the jars into `daemon/assets/bridge/` (as `mc-nexus-bridge-paper.jar`, `mc-nexus-bridge-fabric.jar` and the generic `mc-nexus-bridge.jar`).

## Adding a new game

Games are **game packs** (see [docs/game-packs.md](docs/game-packs.md)); no recompilation is needed.

1. Declarative first: a `hosty-game.json` manifest in the games folder (`npm create hosty-game <id>` scaffolds one). Packs shipped with the app live in `daemon/assets/games/<id>/` (manifest, logo, icons, `dev-mock.json`).
2. Code only when the manifest is not enough: optional `driver.js` (trust-gated). For games shipped with the app, write it as TypeScript in `daemon/src/extensions/<id>/` with a `driver-entry.ts` exporting `createDriver` (see `extensions/minecraft`); `build:games` bundles it into the pack's `driver.js`.
3. Do **not** add `gameId ===` checks or game names/commands to the client or daemon core: use the driver summary (`capabilities`, `configFiles`, `setupSchema`, `playerActions`, `installer`, ...).
4. Add tests (`daemon/test/GamePacks.test.ts`, `GameDrivers.test.ts`).

## Commands

```bash
npm run dev:daemon      # daemon (tsx watch)
npm run dev:client      # Vite dev server
npm run tauri:dev       # full desktop app
npm test                # daemon + client (vitest)
npm run lint            # oxlint (daemon + client)
npm run build           # tsc daemon + client build
npm run tauri:build     # desktop bundle
```

Requirements: Windows 10/11 x64, Node >= 20 (22 LTS recommended), stable Rust, Java 17/21 for Minecraft servers and bridge builds. Extra checks: `npm --prefix client run test:e2e` (Playwright), `npm --prefix client run screenshots`, `npm --prefix packages/game-sdk run typecheck`.

## Conventions

- **Versioning** `a.b.c` (current: `0.4.0`). The **source of truth is the `version` field in the root [package.json](package.json)**; every other version must be set to the same value:
  - `daemon/package.json`, `client/package.json`, `client/src-tauri/tauri.conf.json` and `client/src-tauri/Cargo.toml` (`[package] version`).
  - Lockfiles, refreshed by the tools and never edited by hand: `version` in `daemon/package-lock.json` and `client/package-lock.json` (`npm --prefix <dir> install --package-lock-only`), and the `hosty` entry in `client/src-tauri/Cargo.lock` (any `cargo` command, e.g. `cargo metadata`).
  - `a` (major): `0` while the tool is not yet fully functional. It becomes `1.0.0` only when the product is complete, and only after explicit manual approval.
  - `b` (minor): new features, loaders, game drivers, UI, or major changes. The MVP is built through `b` bumps (`0.1.x` → `0.2.0` for a new feature set).
  - `c` (patch): fixes and minor adjustments. While the MVP is in progress most releases only bump `c` (`0.1.2` → `0.1.3`).
  - Releases: the git tag must be `v` + the root `package.json` version (e.g. `v0.1.3`). Pushing that tag triggers the release workflow (see Release below).
- All code, comments and commits in English; Conventional Commits; never commit to `main` directly (use `feature/`, `fix/`, `refactor/`, `chore/`, `docs/` branches).
- No hardcoded UI strings: use i18n keys present in both `en.json` and `es.json`.
- Run lint, build and tests before considering a task complete.
- Never commit `.env*` (except `.env.example`), `instances/`, or edit lockfiles manually.
- Release: pushing a `v*` tag (matching the root `package.json` version, see Versioning) triggers `.github/workflows/release.yml` automatically (tests, lint, daemon build, sidecar smoke test, Tauri release for Windows/macOS/Linux). Merging to `main` alone does not release. Full steps in [docs/releasing.md](docs/releasing.md).
- README screenshots live in `docs/screenshots/`; regenerate them with `npm --prefix client run screenshots` when the UI changes noticeably.
- CI (`.github/workflows/ci.yml`) runs lint, tests, build, SDK type-check and Playwright on every PR; releases are described in [docs/releasing.md](docs/releasing.md).
