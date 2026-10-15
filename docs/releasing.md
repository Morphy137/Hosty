# Releasing Hosty

## Cutting a release

1. Merge the work into `main` (never commit to it directly) and bump the version in **all** of the files listed
   under Versioning in [AGENTS.md](../AGENTS.md). The root `package.json` is the source of truth. Refresh the
   lockfiles with `npm --prefix <dir> install --package-lock-only` and any `cargo` command.
2. Tag it with the same version: `git tag vX.Y.Z && git push origin vX.Y.Z` (e.g. `v0.1.3`).
3. `.github/workflows/release.yml` runs on Windows, macOS and Linux: tests, lint, daemon build, **sidecar build
   (Node SEA) + health smoke test**, then `tauri-action` builds the installers and uploads them (plus the
   updater `latest.json`) to the GitHub release.

Pull requests and `main` are checked by `.github/workflows/ci.yml` (lint, unit/component tests, build, SDK
type-check, Playwright E2E, and on Windows the sidecar build + `cargo check`).

## Platform support

| Platform | Status |
|---|---|
| Windows 10/11 x64 | Supported and the only platform validated end to end. |
| macOS (Apple Silicon / Intel) | Built by the release matrix; **not validated yet**. Needs Apple signing + notarization to open without Gatekeeper warnings. |
| Linux (x64) | Built by the release matrix (`.deb` / AppImage); **not validated yet**. |

What is already platform-aware: sidecar per Rust target triple, per-OS data folders
(`%APPDATA%\Hosty`, `~/Library/Application Support/Hosty`, `$XDG_DATA_HOME/Hosty`), Java discovery
(`JAVA_HOME`, Adoptium/Microsoft/Zulu folders, `/Library/Java/JavaVirtualMachines`, `/usr/lib/jvm`),
and the log-folder opener. Known gaps: SteamCMD auto-install is not available on macOS, and process
termination semantics on Linux/macOS have not been exercised against real game servers.

### Validating macOS and Linux builds

Before calling a platform supported, run this checklist on a real machine with the release artifact:

1. Install, launch and confirm the sidecar daemon starts (`daemon.log` in the app log folder).
2. Create a Minecraft (Paper) server, start it, join it, and stop it from the UI (graceful `stop`, no orphan process).
3. Create a backup, change the server version, and restore the backup.
4. Close the app while a server runs: the server must stop cleanly.
5. Confirm Java detection and the data folder location from the table above.

## Code signing

Unsigned Windows installers trigger **Microsoft SmartScreen** on first run. Reputation builds with
downloads, but a certificate removes the warning from day one.

### Windows (Azure Trusted Signing)

Add these repository secrets; the release workflow detects them and signs automatically:

| Secret | Value |
|---|---|
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Service principal allowed to sign |
| `TRUSTED_SIGNING_ENDPOINT` | e.g. `https://eus.codesigning.azure.net` |
| `TRUSTED_SIGNING_ACCOUNT` | Trusted Signing account name |
| `TRUSTED_SIGNING_PROFILE` | Certificate profile name |

The workflow installs `trusted-signing-cli` and injects a `bundle.windows.signCommand` through a generated
config file, so `tauri.conf.json` stays certificate-free. A classic OV/EV certificate works too: set
`bundle.windows.certificateThumbprint` instead (needs a self-hosted runner or a hardware token workflow).

### macOS

Provide `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD` (app-specific) and `APPLE_TEAM_ID`; `tauri-action` signs and notarizes.

### Updater signature

`TAURI_SIGNING_PRIVATE_KEY` (and optionally `..._PASSWORD`) sign the update artifacts; the public key is in
`tauri.conf.json > plugins.updater.pubkey`.

> The signing steps are wired but **have not been exercised** (no certificates are configured in this
> repository). Test them on a release candidate tag before relying on them.

## Local verification

```bash
npm run lint && npm test && npm run build      # daemon + client
npm --prefix client run test:e2e               # Playwright (starts daemon + Vite)
npm --prefix packages/game-sdk run typecheck
npm --prefix daemon run build:sidecar          # single-file daemon for the desktop app
npm --prefix client run screenshots            # regenerate docs/screenshots
```

## Installer and icons

- NSIS options live in `client/src-tauri/tauri.conf.json` (`bundle.windows.nsis`): language selector
  (English, Spanish, Latin-American Spanish, Brazilian/European Portuguese, Simplified Chinese), installer icon,
  and the header/sidebar images in `client/src-tauri/installer/*.bmp` (150x57 / 164x314, 24-bit BMP).
- The app icon set is generated from a rounded-corner 512 px PNG with `npx tauri icon <source.png> -o src-tauri/icons`
  (run from `client/`). Keep the source square with transparent rounded corners (about 22% radius).
- Game packs and UI language packs are installed from inside the app (Game packs dialog / `locales` folder);
  the installer does not bundle them, so the installer language choice is installer-only.

## Auto-update feed

The app checks `https://github.com/<owner>/Hosty/releases/latest/download/latest.json` (see
`plugins.updater.endpoints` in `tauri.conf.json`). GitHub serves that URL **only to anonymous clients when the
repository is public**; for a private repository the request returns 404 and the check fails (the app now
reports "Could not check for updates" with the reason). To ship updates, publish the release assets somewhere
public (make the repository public, or point `endpoints` at a public host that mirrors `latest.json` and the
installers).

macOS signing is optional: without the `APPLE_*` secrets the macOS bundle is built unsigned/ad-hoc and
Gatekeeper will warn. Setting `APPLE_CERTIFICATE` (and the rest) switches the workflow to the signed build.
