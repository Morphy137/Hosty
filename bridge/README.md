# MC-Nexus Telemetry Bridge (`mc-nexus-bridge`)

High-performance, zero-console-spam server telemetry bridge and administration mod/plugin for **MC-Nexus**.

## Features
- **Real-Time Telemetry (1 Hz / 20 ticks)**:
  - Exact TPS (Ticks Per Second) & MSPT (Milliseconds Per Tick)
  - Loaded chunks & active entities count
  - Online players with coordinates (XYZ), dimension (`overworld`, `the_nether`, `the_end`), health, food level, ping (ms), gamemode, and OP status
- **Direct Silent Admin Commands**:
  - Instant Heal / Damage without chat feedback spam
  - Silent Teleportation & Inventory Inspection
  - Kick / Freeze / Kill direct execution
- **WebSocket IPC**:
  - Authenticated connection (per-instance token) to the daemon URL found in `.hosty/bridge.json`; speaks [protocol v1](../docs/bridge-protocol.md)
  - Automatic reconnection with exponential backoff
- **Universal Multi-Version Support**:
  - **Paper / Purpur / Spigot Plugin**: 1 single `.jar` covers Minecraft 1.16 through 1.21+
  - **Fabric Server-Side Mod**: Dedicated server mod for 1.20.x & 1.21.x modpacks

---

## Building from Source

### Paper Plugin
```bash
cd bridge/paper
mvn clean package
# Output: target/mc-nexus-bridge-paper-<version>.jar  (copy to daemon/assets/bridge/mc-nexus-bridge-paper.jar)
```

### Fabric Mod
```bash
cd bridge/fabric
./gradlew build
# Output: build/libs/mc-nexus-bridge-fabric-<version>.jar  (copy to daemon/assets/bridge/mc-nexus-bridge-fabric.jar)
```
