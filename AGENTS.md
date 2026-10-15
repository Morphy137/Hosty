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
├─ bridge/   In-game telemetry/admin plugins (Paper plugin, Fabric mod)
├─ instances/ Runtime server data (gitignored: worlds, jars, logs)
└─ .github/workflows/release.yml  Tauri release build on `v*` tags
```

- **Client ⇄ daemon**: REST (`/api/...`) + WebSocket. Default daemon URL `http://localhost:4000` (`VITE_DAEMON_URL`, see `client/.env.example`). Dev client runs on `http://localhost:5173`.
- **Daemon ⇄ bridge**: protocol v1 over WebSocket (spec: [docs/bridge-protocol.md](docs/bridge-protocol.md), schema + tester in `packages/bridge-protocol`). The daemon writes `<instance>/.hosty/bridge.json` (url + per-instance token) before a server starts; the bridge sends `HELLO` with its capabilities and the UI only enables advertised features. Pre-v1 bridges are rejected. Bridge jars live in `daemon/assets/bridge/` and are installed via `POST /api/instances/:id/bridge/install` (Paper/Purpur/Spigot/Fabric; none for Forge/NeoForge yet).
- **UI ⇄ daemon auth**: in the desktop app Rust generates `MC_NEXUS_API_TOKEN` per run and exposes it with `get_daemon_token`; REST uses `x-hosty-token`, WebSocket/`<img>` URLs use `?token=`.
- **Tauri shell** (`client/src-tauri`) wraps the frontend and supervises the daemon as a sidecar (`binaries/hosty-daemon-<triple>`, built by `npm --prefix daemon run build:sidecar` with esbuild + Node SEA). In release builds Rust picks the port (4000 or a free one), passes `MC_NEXUS_INSTANCE_DIR`/`MC_NEXUS_ASSETS_DIR`, exposes it via the `get_daemon_url` command and logs the sidecar to `app_log_dir/daemon.log`. On exit it writes `shutdown` to the sidecar stdin so Java servers stop gracefully. In `tauri dev` the sidecar is not spawned; run `npm run dev:daemon`.

### Daemon (`daemon/src`)

- `index.ts` — Express routes + WebSocket server. Route groups: `/api/health`, `/api/system/environment`, `/api/games`, `/api/instances/*` (select, create, import, settings, icon, restart, console, bridge install, upload-server-jar), `/api/properties`, `/api/mods/files|configs`, `/api/provisioning/versions/:loader|install`.
- `config/env.ts` — env loading/validation (`MC_NEXUS_PORT` default 4000, `_HOST`, `_ALLOWED_ORIGINS`, `_INSTANCE_DIR`, `_JAVA_PATH`, `_MIN/MAX_RAM_MB`, `_ENABLE_MOCK`, ...). Mock/simulated telemetry is enabled by default outside production.
- `core/drivers/` — **game driver abstraction**: `IGameDriver` (summary with capabilities/config files/setup schema, `validateInstallation`, `buildLaunchPlan`, stop/save commands, `parseLogLine`, optional query/position polling) registered in `GameDriverRegistry`. `MinecraftDriver` is code; Project Zomboid and Hytale are built-in manifests run by `core/gamepacks/DeclarativeDriver`. `core/gamepacks/PackLoader` loads user packs from `MC_NEXUS_GAMES_DIR` (trust-gated `driver.js`); `ConfigFileEditor` edits the declared config files; `provisioning/SteamCmd` installs Steam games.
- `core/` — `InstanceManager` (instance CRUD/persistence), `ProcessSupervisor` + `SupervisorRegistry` (process lifecycle, metrics via `pidusage`), `LogLineParser`/`LineBuffer`, `ModJarManager`, `EnvironmentDetector` (Java detection), `bridge/` (`BridgeProtocol`, `TelemetryBridgeManager`).
- `parsers/` — `.properties`, mod config (TOML via `@iarna/toml`, etc.) parsing and update helpers.
- `provisioning/` — `ServerInstaller` downloads server jars (automatic loaders: `paper`, `purpur`, `fabric`, `vanilla`, plus `forge`/`neoforge` whose official installers are downloaded from Maven and run with `--installServer`; Spigot stays manual). `JarInspector` identifies an uploaded jar (loader, MC version, installer vs server). `ProvisionJobs` tracks installs as background jobs: `POST /api/provisioning/install` returns `{ jobId }`, progress is broadcast as `PROVISION_PROGRESS`, `GET /api/provisioning/jobs/:id` and `POST .../jobs/:id/cancel` exist. `MinecraftDriver` launches Forge/NeoForge via the generated `libraries/**/win_args.txt` (`@args` mode) and everything else with `-jar server.jar`.

### Client (`client/src`)

- `App.tsx` root; `components/{layout,tabs,modals,common}`; tabs: Overview, Players, Mods, Mod Configs, server.properties (+ Provisioning).
- `hooks/` (data + socket + theme), `state/daemonSocketReducer.ts`, `api/daemonApi.ts`, `types/daemon.ts`, `utils/`.
- **i18n**: `i18n/locales/en.json` and `es.json`; parity enforced by `test/i18nParity.test.ts`.
- **Creation wizard** (`components/wizard`): origin (create/import) → game → setup → customize → install → done. Game cards come from `/api/games` (`status`: available/beta/coming_soon); the setup step renders the driver's `setupSchema` (`SchemaFields`) or a registered custom component (`steps/customSetupComponents.ts`, e.g. `minecraft-install`). `wizardPlan.ts` maps the draft to the daemon operation (install / upload / create / import). Import uses `POST /api/instances/inspect-folder`; the daemon also exposes `GET /api/system/ports/:port`.
- **Design system**: colours are semantic tokens defined once in `src/index.css` (`bg-surface`, `text-ink`, `border-hairline`, ...; dark mode only swaps the variable values, so no `dark:` colour pairs). Hex colours outside `index.css` and native `<select>` fail `test/designSystem.test.ts`. Reusable primitives live in `components/ui/` (Button, IconButton, Input, Select, Dialog, Tabs, Badge, Tooltip, DropdownMenu, Toast, Skeleton, Stepper, Slider, Dropzone; Radix-based). Shell: `layout/TitleBar` (frameless window, Tauri only), `layout/Sidebar` (server list + settings), `layout/ServerHeader` (single Start/Stop button + menu); tabs come from driver capabilities (`utils/tabs.ts`).
- Game logos in `public/logos` and `src/assets/logos`.

### Bridge (`bridge/`)

- `paper/` (Maven, one jar for MC 1.16–1.21+, Paper/Purpur/Spigot) and `fabric/` (Gradle, server-side, 1.20.x–1.21.x); both implement protocol v1. Build: `mvn clean package` / `./gradlew build`; copy outputs into `daemon/assets/bridge/` (as `mc-nexus-bridge-paper.jar`, `mc-nexus-bridge-fabric.jar` and the generic `mc-nexus-bridge.jar`) when updated.

## Adding a new game

Games are **game packs** (see [docs/game-packs.md](docs/game-packs.md)); no recompilation is needed.

1. Declarative first: a `hosty-game.json` manifest in the games folder (`npm create hosty-game <id>` scaffolds one). Built-in manifests live in `daemon/src/core/gamepacks/builtin/` and are registered in `GameDriverRegistry`.
2. Code only when the manifest is not enough: optional `driver.js` (trust-gated) or, for built-in games, a class implementing `IGameDriver` (see `MinecraftDriver`).
3. Do **not** add `gameId ===` checks to the client or daemon: use `capabilities`, `configFiles` and `setupSchema` from the driver summary.
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

- **Versioning** `a.b.c` (current: `0.2.2`). The **source of truth is the `version` field in the root [package.json](package.json)**; every other version must be set to the same value:
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
