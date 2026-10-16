# Hosty — Auditoría 0.2.7 (2026-10-15)

Estado auditado: `main @ 623dd91` (tag `v0.2.7`). Alcance: daemon, game packs/extensiones, provisioning, bridge (Paper/Fabric), cliente, shell Tauri, docs.

## 1. Idea general (cómo encaja todo)

```
Tauri (Rust)  ──spawn + token──▶  daemon (Node SEA, 127.0.0.1:<puerto>)  ──spawn/stdin──▶  servidor del juego
   │ get_daemon_url / token            │  REST /api/* + WebSocket (UI)              ▲
   ▼                                   │  GameDriverRegistry ◀── packs (hosty-game.json)
 React UI ◀──── REST + WS ─────────────┘  bridge WS /telemetry/bridge ◀── plugin/mod (protocolo v1, token por instancia)
```

- **Juego = pack**. Cada juego es un manifest `hosty-game.json` ejecutado por `DeclarativeGameDriver`; Minecraft añade una extensión de código empaquetada (`extensions/minecraft`). Los packs de usuario viven en `%APPDATA%\com.hosty.app\games` y pueden traer `driver.js` (solo corre tras aprobar su hash).
- **El core no conoce juegos**: pestañas, acciones de jugador, presets JVM, catálogo de mods, instalador, sincronización de config, carpetas… salen del manifest.
- **Instancia** = carpeta con `instance.json` (+ `.hosty/` para bridge, consola y backups). Importadas = carpeta externa registrada en `instances_registry.json`.
- **Bridge** opcional: plugin/mod que se conecta al daemon con token y anuncia capacidades; la UI solo activa lo anunciado.

## 2. Verificación

| Check | Resultado |
|---|---|
| `npm run lint` | 0 errores |
| `npm test` | daemon 191/191, cliente 50/50 |
| `npm run build` | OK (aviso: chunk único de 825 kB) |
| `game-sdk typecheck` | OK |

Todo verde, pero varios bugs de abajo **no están cubiertos por tests** (regex del manifest, spawn de `.bat`, ubicación de config de PZ).

## 3. Hallazgos

### 3.1 Críticos — funcionalidad rota o riesgo de datos

| # | Hallazgo | Evidencia | Impacto | Corrección |
|---|---|---|---|---|
| C1 | **Posición de jugadores en Minecraft nunca se actualiza sin bridge.** El patrón `Pos` tiene los `\d` doblemente escapados (`\\\\d`), así que la regex busca un `\` literal. Comprobado: `new RegExp(pattern).test('Steve has the following entity data: [12.5d, 64.0d, -3.25d]') === false`. | [hosty-game.json:121](../daemon/assets/games/minecraft/hosty-game.json) | Coordenadas siempre 0 y la respuesta de `data get` ensucia la consola cada 5 s por jugador. | Usar `\\d` en el JSON y añadir un test que ejecute las `playerQueries` del manifest contra líneas reales. |
| C2 | **Lanzar un `.bat`/`.cmd` falla y deja el servidor en `STARTING` para siempre.** Node ≥18.20/20.12 lanza `EINVAL` síncrono al hacer `spawn` de un `.bat` sin `shell` (verificado en Node 24). `start()` pone `STARTING` antes del `spawn` y no captura la excepción. | [ProcessSupervisor.ts:278-285](../daemon/src/core/ProcessSupervisor.ts) | PZ cae a `StartServer64.bat` si falta el `.exe`; cualquier pack con script de arranque queda bloqueado (botón Start inutilizable hasta reiniciar Hosty). | `try/catch` alrededor del spawn → `fail('PROCESS_ERROR')` + `OFFLINE`; para `.bat/.cmd` usar `cmd.exe /d /s /c` con args escapados. |
| C3 | **Project Zomboid no usa los archivos que Hosty edita.** PZ guarda `servertest.ini` en `%USERPROFILE%\Zomboid\Server\`, no en la carpeta de la instancia. `configFiles`/`configSync` apuntan a `<instancia>/servertest.ini`. Además todas las instancias PZ comparten `-servername servertest`. | [project-zomboid/hosty-game.json](../daemon/assets/games/project-zomboid/hosty-game.json) | Editor de config, puerto y max jugadores no tienen efecto; dos servidores PZ comparten mundo y config. | Añadir `-cachedir={{instanceDir}}/Zomboid` (exponer `instanceDir` en `renderTemplate`) y apuntar `configFiles`/`configSync` a `Zomboid/Server/servertest.ini`. |
| C4 | **PZ se bloquea en el primer arranque** pidiendo la contraseña de administrador por stdin. | manifest PZ `launch.args` | El servidor nunca llega a `ONLINE`. | Campo `adminPassword` en `setup` → `-adminpassword {{adminPassword}}`. |
| C5 | **Una actualización fallida o cancelada borra el `server.jar` actual.** `downloadFile` escribe directamente en `server.jar` y hace `rmSync(dest)` si falla. | [ServerInstaller.ts:127-131](../daemon/src/extensions/minecraft/ServerInstaller.ts), [download.ts](../daemon/src/provisioning/download.ts) | El servidor queda sin arrancar (recuperable solo restaurando el backup `preupdate`). | Descargar a `*.part` y renombrar al terminar; verificar checksum (Mojang da `sha1`, Paper Fill v3 da `sha256`). |
| C6 | **Cambiar de Forge/NeoForge a otro loader sigue lanzando Forge.** `launch.discover` prioriza `libraries/**/win_args.txt` sobre `server.jar` y no mira `instance.loader`; las carpetas de la versión anterior no se limpian. Con varias versiones de Forge gana la primera por orden alfabético. | manifest MC `launch.discover`, [DeclarativeDriver.ts:176-184](../daemon/src/core/gamepacks/DeclarativeDriver.ts) | Tras cambiar versión/loader arranca el servidor equivocado. | Filtrar el `discover` por loader/versión guardados (p. ej. `glob` con `{{loaderVersion}}`) o limpiar `libraries/net/{minecraftforge,neoforged}` al cambiar de variante. |
| C7 | **Si el driver de un juego no está cargado se usa Minecraft en silencio.** `getDriver()` cae al default. | [GameDriverRegistry.ts:179](../daemon/src/core/drivers/GameDriverRegistry.ts) | Un pack con error de validación o eliminado → la instancia se muestra como Minecraft, `configSync` escribe `server.properties` en la carpeta de otro juego y Start ejecuta `java -jar server.jar`. | `getDriver` estricto; instancias con driver ausente se marcan "no disponible" y no se pueden iniciar ni editar. |
| C8 | **Escrituras JSON no atómicas.** `instance.json`, `instances_registry.json`, `.disabled.json`, `.trusted.json` se escriben con `writeFileSync` y, si no se pueden parsear, se usa `{}`. | [InstanceManager.ts](../daemon/src/core/InstanceManager.ts) | Un corte de luz durante el guardado borra la config: el `gameId` vuelve al default (C7) y se pierden RAM, puerto, etc. | Escribir a `.tmp` + `rename`; guardar `.bak`; no tratar un JSON corrupto como vacío. |

### 3.2 Altos

| # | Hallazgo | Evidencia | Corrección |
|---|---|---|---|
| A1 | **EULA de Minecraft aceptado automáticamente** (`eula=true`, log "eula.txt signed automatically") sin que el usuario lo vea. | [MinecraftDriver.ts:149-150](../daemon/src/extensions/minecraft/MinecraftDriver.ts), [ServerInstaller.ts:151](../daemon/src/extensions/minecraft/ServerInstaller.ts) | Casilla con enlace al EULA en el wizard (declarada en el manifest, p. ej. `setup` tipo `agreement`) y escribir `eula.txt` solo si se acepta. |
| A2 | **Backups en memoria y bloqueantes.** `AdmZip` carga todo el mundo en RAM y comprime de forma síncrona en el hilo del daemon; con el servidor online solo envía `save-all` y copia al instante (mundo a medio escribir). | [BackupManager.ts:42-61](../daemon/src/core/BackupManager.ts), [index.ts:383-385](../daemon/src/index.ts) | Zip en streaming (`archiver`/`yazl`) como job en segundo plano con progreso; `save-off` → `save-all flush` → esperar a "Saved the game" → copiar → `save-on` (comandos declarados en el manifest). |
| A3 | **Restaurar no elimina archivos nuevos** (`extractAllTo` solo sobrescribe): regiones/chunks posteriores al backup quedan mezclados. | [BackupManager.ts:64-67](../daemon/src/core/BackupManager.ts) | Borrar las rutas incluidas en el backup antes de extraer (ya hay copia `prerestore`). |
| A4 | **Los backups viven dentro de la instancia** (`.hosty/backups`): borrar el servidor o perder la carpeta borra también sus backups. | [BackupManager.ts:11](../daemon/src/core/BackupManager.ts), [InstanceManager.ts](../daemon/src/core/InstanceManager.ts) `deleteInstance` | Carpeta de backups fuera de la instancia (`<appData>/backups/<id>`) o avisar en el diálogo de borrado. |
| A5 | **`.hosty/console.log` crece sin límite** y se lee entero al crear cada supervisor. | [ProcessSupervisor.ts:149-184](../daemon/src/core/ProcessSupervisor.ts) | Rotación por tamaño (p. ej. 5 MB → `console.1.log`) y leer solo la cola del archivo. |
| A6 | **"Abrir puerto en el firewall" casi siempre falla**: `netsh` necesita admin y el daemon corre sin elevación. Las reglas no se borran al cambiar puerto o eliminar el servidor. PZ además necesita el puerto UDP+1 (16262). | [NetworkInfo.ts](../daemon/src/core/NetworkInfo.ts) | Elevar con UAC (`powershell Start-Process netsh -Verb RunAs`) o un comando Tauri; puertos extra declarados en el manifest (`ports: [{offset:1, protocol:'udp'}]`); borrar reglas al eliminar. |
| A7 | **Asignación de puertos de PZ colisiona**: `findNextAvailablePort` suma 1, así que el segundo PZ usa 16262 = UDP del primero. | [InstanceManager.ts](../daemon/src/core/InstanceManager.ts) `findNextAvailablePort` | Paso de puerto declarado por juego (`portStride: 2` en PZ) y comprobar puertos en uso del SO. |
| A8 | **Bridge Paper: compatibilidad declarada no real.** Compilado a Java 17 (`maven.compiler.target 17`) pero promete MC 1.16+ (Java 8/11). `Bukkit.getTPS()` es API de Paper y está fuera del `catch (Throwable)`: en Spigot lanza `NoSuchMethodError` cada segundo. | [pom.xml:15-16](../bridge/paper/pom.xml), [NexusBridgePlugin.java:187](../bridge/paper/src/main/java/com/mcnexus/bridge/NexusBridgePlugin.java) | Compilar con `--release 8` (o documentar ≥1.17) y envolver `getTPS` en el `try` existente. Sustituir `w.getEntities().size()` (lista nueva por mundo y segundo) por `getEntityCount()` en Paper. |
| A9 | **Estado global "instancia activa" en el daemon.** Mods, configs, config-files y Start/Stop/Command por WebSocket actúan sobre la instancia activa del servidor, no sobre un id explícito. Al terminar una instalación el daemon cambia la activa por su cuenta. | [index.ts:944-1010, 1241-1287, 1491-1516, 824-826](../daemon/src/index.ts) | Pasar `instanceId` en todas las rutas (`/api/instances/:id/mods/...`) y acciones WS; la selección pasa a ser estado del cliente. Evita condiciones de carrera al cambiar de servidor. |
| A10 | **Los logs de instalación se envían como `CONSOLE` a todos los clientes**, sin `instanceId`: aparecen en la consola del servidor que se esté viendo (contradice `44c0506`). | [index.ts:809-812](../daemon/src/index.ts) | Enviar solo `PROVISION_LOG` con `instanceId` o usar `logToInstance(ctx.instanceId, …)`. |
| A11 | **"Detener" con `ctrl+c` no funciona en Windows**: se escribe el carácter `\u0003` en stdin, que no genera SIGINT. `kill()` no mata el árbol de procesos (launchers `.bat`). | [DeclarativeDriver.ts:282-285](../daemon/src/core/gamepacks/DeclarativeDriver.ts), [ProcessSupervisor.ts:341-345](../daemon/src/core/ProcessSupervisor.ts) | En Windows: `taskkill /T /PID` (y `/F` para kill); documentar que `ctrl+c` solo es fiable en Unix. Las métricas `pidusage` también miden solo el proceso padre. |

### 3.3 Medios

| # | Hallazgo | Corrección |
|---|---|---|
| M1 | `getInstance(id)` llama a `listInstances()`, que escanea todas las carpetas, lee cada `instance.json`, ejecuta `validateInstallation` de **todos** los drivers y lee configs; se invoca varias veces por petición/mensaje WS. | Caché en memoria invalidada en create/update/delete/import (+ `fs.watch` opcional). |
| M2 | Sin validación de payloads: `POST /api/instances/:id/settings` acepta cualquier objeto (`gameId` inexistente, `minRamMb > maxRamMb`, puerto fuera de rango, `javaPath` arbitrario). | Esquema (zod/valibot) por ruta; rechazar campos desconocidos. |
| M3 | `gameConfig` (campos de `setup`, p. ej. rama de PZ) no es editable tras crear el servidor. | Renderizar `SchemaFields` en `EditServerModal`. |
| M4 | Pestaña Mods en PZ apunta a `mods/` (`DEFAULT_MOD_LAYOUT`), que PZ no usa: los mods de PZ son IDs de Workshop en el `.ini` (`Mods=`, `WorkshopItems=`). | `capabilities.mods: false` en PZ hasta tener un `modLayout` tipo `workshop`. |
| M5 | Hytale es un placeholder: puerto 25565 (el de Minecraft), sin `--assets` ni autenticación. Está como `coming_soon`, pero el manifest no refleja el servidor oficial. | Revisar contra el manual oficial del servidor de Hytale (puerto UDP/QUIC, versión de Java, login del servidor) antes de pasarlo a beta. |
| M6 | Métricas de bridge obsoletas: `setBridgeActive(false)` no limpia `lastBridgeMetrics`, el TPS se queda congelado tras desconectar el bridge. | Limpiar en `setBridgeActive(false)`. |
| M7 | Trust de `driver.js` solo hashea ese archivo; si hace `require('./helper.js')`, el helper puede cambiar sin volver a pedir aprobación. Además `require` cachea: "Recargar packs" no recoge cambios de código. | Hashear todos los `.js` del pack; borrar `require.cache` del pack al recargar. |
| M8 | Bridge WS: sin timeout para `HELLO` ni `maxPayload` (100 MB por defecto). | `maxPayload: 1 MB` y cerrar sockets sin `HELLO` en 10 s. |
| M9 | Si el sidecar muere, Rust solo lo registra: no lo reinicia y `daemon.log` se trunca en cada arranque (se pierde el log del crash). | Reinicio con backoff (máx. N) + rotar `daemon.log` → `daemon.1.log`. |
| M10 | CORS acepta cualquier origen que *empiece* por `http://localhost` (`http://localhost.evil.com`). Solo importa sin token (dev). | Comparar `new URL(origin).hostname`. |
| M11 | Upload de jar sin límite de tamaño; si el stream falla antes de asignar `tempPath`, el temporal queda en `%TEMP%`. | Límite configurable + limpiar en `inspectRequestFile`. |
| M12 | Editar el puerto no comprueba si está en uso (el wizard sí). | Reusar `isPortInUse` en `EditServerModal`. |

### 3.4 Bajos / mantenimiento

- `daemon/src/index.ts` tiene 1635 líneas con todas las rutas: dividir en routers (`instances`, `games`, `packs`, `mods`, `provisioning`, `ws`).
- Bundle del cliente en un único chunk de 825 kB: `lazy()` para modales grandes (catálogo de mods, inventario, wizard).
- Textos visibles en inglés fijos en el daemon: aviso de reinicio a jugadores (`Server restarting in N seconds`), mensajes `[Hypervisor]`/`[Provisioner]`, "MC-Nexus Bridge installed". Al menos el broadcast a jugadores debería ser configurable.
- `PlayerState` por defecto `y: 64` en el core (herencia de Minecraft).
- `USER_AGENT` con contacto ficticio `contact@mc-nexus.local` en [ServerInstaller.ts](../daemon/src/extensions/minecraft/ServerInstaller.ts); Paper pide un contacto real. Unificar con el UA de `download.ts`.
- `DEFAULT_MINECRAFT_VERSIONS` (fallback offline) termina en 1.21.4 y la UI no indica que es una lista de respaldo.
- **Docs**: README muestra `version-0.5.1--alpha` y "alpha (`0.5.x`)" con la app en `0.2.7`. `docs/audit-2026-10.md` (auditoría de 0.1.2) está sin trackear y desactualizada: archivarla o borrarla.

## 4. Estado funcional por área

| Área | Estado | Notas |
|---|---|---|
| Packs / extensiones (instalar, activar, desactivar, trust, plantilla, recargar) | Funcional | Riesgos: C7 (fallback silencioso), M7 (trust parcial / caché). |
| Minecraft: instalación Paper/Purpur/Fabric/Vanilla/Forge/NeoForge | Funcional | C5, C6, A1; sin checksums. |
| Minecraft: jugadores sin bridge | **Roto parcialmente** | C1: join/leave funcionan, posición/dimensión por consulta no. |
| Bridge Paper/Fabric | Funcional en Paper/Purpur 1.20+ y Fabric | A8 en Spigot y <1.17. |
| Project Zomboid | **No funcional end-to-end** | C2, C3, C4, A6, A7, M4. |
| Hytale | Placeholder (`coming_soon`) | M5. |
| Configuraciones (editor genérico, `configSync`) | Funcional para MC | Ineficaz en PZ (C3); `gameConfig` no editable (M3). |
| Backups | Funcional en servidores pequeños | A2–A4. |
| Resiliencia (auto-restart, reinicio programado, autostart) | Funcional | C2 deja el estado colgado; A11 en Windows. |
| Red (LAN/IP pública/firewall) | Parcial | A6. |
| Catálogo de mods (Modrinth) | Funcional | Verifica `sha1`, restringe hosts de iconos. |
| i18n | Funcional | Paridad en/es con test; packs de idioma por carpeta. |
| Seguridad UI⇄daemon y daemon⇄bridge | Sólida | Token por ejecución, tokens por instancia, comparación en tiempo constante, CSP. Ajustes M8, M10. |

## 5. Plan sugerido

1. **`fix/` inmediato (0.2.8)**: C1, C2, C5, C7, C8, A10, M6. Cambios pequeños y localizados, cada uno con su test.
2. **`fix/project-zomboid` (0.2.9)**: C3, C4, A7, M4, puertos extra en el firewall. Probar con un servidor real.
3. **`feature/backups-v2` (0.3.0)**: A2–A4 como jobs en segundo plano con progreso.
4. **`refactor/instance-scoped-api`**: A9 + M1 + M2 + división de `index.ts`. Cambia la API cliente⇄daemon: requiere confirmación antes de empezar.
5. **Legal/UX**: A1 (EULA), A6 (UAC), M3, M12.
6. **Bridge**: A8 + nueva versión de los jars.
7. **Mantenimiento**: M9, M11, code-splitting, docs/README.

## 6. Estado de implementación (rama `fix/critical-audit-findings`)

| # | Estado | Cambio |
|---|---|---|
| C1 | Hecho | Regex `Pos` corregida + test que ejecuta las `playerQueries` del manifest. |
| C2 | Hecho | `spawn` en `try/catch` (vuelve a `OFFLINE` con `PROCESS_ERROR`); `.bat/.cmd` se lanzan con `cmd.exe /d /s /c` (test con un `.bat` real en Windows). |
| C3 | Hecho | PZ usa `-cachedir={{instanceDir}}/Zomboid`; `configFiles`/`configSync` apuntan a `Zomboid/Server/servertest.ini`. Nuevo placeholder `{{instanceDir}}`. |
| C4 | Hecho | Campo `adminPassword` (`secret`, obligatorio) → `-adminpassword`. El wizard ahora respeta `required` en los campos de `setup`. |
| C5 | Hecho | Descarga a `*.part` + `rename`; verificación `sha1` (Mojang) y `sha256` (Paper). **Bug extra encontrado**: `pipe()` no propagaba un corte de red y la descarga quedaba colgada para siempre; ahora usa `pipeline` (también en la subida de jars). |
| C6 | Hecho | `launch.discover` acepta `variants`; las entradas de Forge/NeoForge solo aplican a ese loader y, con varias versiones, gana la instalada más recientemente. |
| C7 | Hecho | `getDriver(id)` ya no cae a Minecraft (`GAME_UNAVAILABLE`); las instancias sin driver se listan con `gameAvailable: false` y no se pueden iniciar. |
| C8 | Hecho | `JsonStore`: escritura atómica (`.tmp` + `rename` + `.bak`), recuperación desde `.bak`, `SETTINGS_CORRUPT` en vez de sobrescribir; un registro dañado se aparta como `.corrupt-<ts>`. |
| A7 | Hecho | `defaults.portStride` (PZ = 2) en daemon y wizard; PZ recibe `-udpport {{nextPort}}`. |
| M4 | Hecho | PZ `capabilities.mods: false`. |

Pendiente de validar con un servidor real de Project Zomboid: que el lanzador acepte `-cachedir`, `-udpport` y `-adminpassword` tal como se pasan (y si `-memory` tiene efecto). La contraseña se guarda en `instance.json` (`gameConfig`) y aparece en la línea de comandos del proceso. Los servidores PZ existentes no tienen `adminPassword` y aún no se puede editar tras crearlos (M3).
