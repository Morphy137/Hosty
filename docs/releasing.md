# Releasing Hosty

## Cutting a release

1. Merge the work into `main` (never commit to it directly) and bump the version in **all** of:
   `package.json`, `daemon/package.json`, `client/package.json`, `client/src-tauri/tauri.conf.json`,
   `client/src-tauri/Cargo.toml` (and their lockfiles via `npm install --package-lock-only`).
2. Tag it: `git tag v0.5.1 && git push origin v0.5.1`.
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
