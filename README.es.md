<div align="center">

<img src="docs/brand/hosty-banner.svg" alt="Hosty - Servidores de juegos locales, simples." width="100%" />

**Tus servidores de juegos locales, en un solo panel.**

Crea, ejecuta y administra servidores dedicados en tu propio PC, sin terminales, sin buscar archivos de configuración y sin dolores de cabeza.

![Versión](https://img.shields.io/badge/version-0.3.1--alpha-blue)
![Plataforma](https://img.shields.io/badge/platform-Windows-lightgrey)
![Licencia](https://img.shields.io/badge/license-PolyForm%20Noncommercial-orange)

[English](README.md) · **Español**

</div>

---

![Resumen de Hosty](docs/screenshots/overview.png)

## ¿Qué es Hosty?

Hosty es una aplicación de escritorio que hace que alojar un servidor de juegos en tu propio computador sea tan fácil como jugar. Elige un juego, elige una versión y pulsa **Iniciar**: Hosty se encarga de las descargas, la configuración y el monitoreo.

**No está atado a un solo juego.** Hosty es una plataforma multijuego y el soporte para más juegos se añade con el tiempo.

## Juegos compatibles

Cada juego es un **pack** (un complemento) que Hosty copia a su carpeta de juegos al abrirse por primera vez. Puedes desactivarlos, desinstalarlos o instalar más desde el **catálogo firmado** de la app.

| Juego | Estado |
| --- | --- |
| **Minecraft** (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge) | Disponible |
| **Project Zomboid** | Beta (instalación con SteamCMD) |
| **Hytale** | Próximamente |
| **Cualquier juego** | Añádelo tú con un [pack de juego](docs/game-packs.md) |

## Características

- **Creación guiada** — un asistente paso a paso elige el juego, instala el servidor por ti (incluidos Forge y NeoForge), te deja elegir la versión del juego y el build del loader, detecta el loader de un jar que traigas y aplica valores por defecto sensatos.
- **Control con un clic** — un solo botón Iniciar/Detener por servidor, con reinicio y cierre forzado confirmado en el menú, y guardado seguro al apagar.
- **Panel en vivo** — mira CPU, memoria, rendimiento del servidor y quién está conectado, en tiempo real.
- **Consola en vivo** — lee la salida del servidor y envía comandos, con atajos prácticos.
- **Gestión de jugadores** — ve dónde está cada uno y cura, regala, daña, expulsa o inspecciona inventarios sin escribir comandos.
- **Mods sin complicaciones** — activa, desactiva o elimina mods y edita su configuración desde la app.
- **Ajustes sencillos** — modifica las propiedades del servidor con un editor limpio en lugar de archivos de texto.
- **Importa servidores existentes** — elige una carpeta y Hosty detecta el juego, el loader y la versión.
- **Varios servidores** — mantén varios en la barra lateral y cambia entre ellos al instante.
- **Catálogo de juegos firmado** — instala y actualiza packs desde la app; cada archivo se verifica con una firma antes de instalarse.
- **Extensible** — añade juegos con un pequeño [pack de juego](docs/game-packs.md) y conecta bridges dentro del juego mediante un [protocolo](docs/bridge-protocol.md) abierto.
- **Temas claro y oscuro**, en **inglés** y **español** (más idiomas se pueden añadir como traducciones de la comunidad).

<table>
  <tr>
    <td><img src="docs/screenshots/players.png" alt="Gestión de jugadores" /></td>
    <td><img src="docs/screenshots/create-server.png" alt="Asistente para crear servidores" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Gestiona jugadores de un vistazo</sub></td>
    <td align="center"><sub>Crea un servidor en pocos pasos</sub></td>
  </tr>
</table>

## Requisitos

- Windows 10 / 11 (64 bits). Las compilaciones de macOS y Linux las produce la integración continua, pero aún no están validadas.
- Java 17 o 21 (solo para los juegos que lo necesitan, como Minecraft)

## Primeros pasos

Descarga el último instalador desde la página de [Releases](../../releases), ejecútalo y crea tu primer servidor.

### Ejecutar desde el código fuente

Necesitas Node.js 20+ (se recomienda 22 LTS) y la versión estable de Rust.

```bash
# Instalar dependencias
npm --prefix daemon install
npm --prefix client install

# Terminal 1: el daemon (la app de escritorio lo usa en modo desarrollo)
npm run dev:daemon

# Terminal 2: la app de escritorio completa
npm run tauri:dev
```

## Estado del proyecto

Hosty está en **alfa** (`0.3.x`) y evoluciona rápido. Se agradecen mucho los comentarios y las ideas. Consulta [docs/releasing.md](docs/releasing.md) para el estado de cada plataforma y la firma de código.

## Licencia

Hosty es de uso libre para copiar y modificar con fines no comerciales, bajo la
[PolyForm Noncommercial License 1.0.0](LICENSE). No se permite venderlo ni usarlo en un producto o servicio de pago, y
quien lo comparta, con o sin modificaciones, debe conservar el aviso de autoría (la línea `Required Notice:` de [LICENSE](LICENSE)).

Los paquetes SDK de `packages/` (`game-sdk`, `create-hosty-game`, `bridge-protocol`) siguen bajo MIT para que cualquiera
pueda crear packs de juegos con ellos. Los packs de otros autores conservan la licencia que sus autores elijan.
