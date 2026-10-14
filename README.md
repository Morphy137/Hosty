# Hosty

High-performance, friendly local multi-game server management dashboard and desktop application powered by **Tauri v2**, **React 19**, and a **Node.js process supervisor daemon**.

## Versioning Scheme

Hosty strictly adheres to a semantic versioning convention structured as `a.b.c`:

* **`a` (Major)**: Significant milestones and production releases. Incremented **only after explicit manual approval and validation**.
* **`b` (Minor)**: New functional improvements, loaders, game drivers, or UI features.
* **`c` (Patch)**: Bug fixes, UI adjustments, and minor maintenance changes.

**Current Version:** `0.1.0` (Alpha / Development milestone toward `1.0.0`).

## System Requirements

- **Operating System:** Windows 10/11 (x64)
- **Node.js:** `>= 20.x` (Recommended: Node 22 LTS)
- **Rust Toolchain:** Stable (for Tauri desktop app compilation)
- **Java Runtime Environment (JRE/JDK):** Java 17 or Java 21 (Temurin / Adoptium) is required to run Minecraft servers and compile bridge plugins.

## Architecture

```
hosty/
├── client/           # React 19 + Vite + Tailwind CSS + Tauri v2 frontend
├── daemon/           # Express + WebSocket process supervisor & game drivers
└── bridge/           # In-game telemetry plugins (Fabric mod & Paper plugin)
```

## Getting Started

### Development
```bash
# Run backend daemon
npm run dev:daemon

# Run frontend client
npm run dev:client

# Or run full desktop app via Tauri
npm run tauri:dev
```

### Build & Testing
```bash
# Run all unit and integration tests
npm test

# Run code linter
npm run lint

# Build production assets
npm run build
```
