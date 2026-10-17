# Plan: sección de Configuración de la app

> **Estado (0.4.0): implementado.** Fases 1-4 completas. Fuera de alcance por ahora: minimizar a la bandeja del sistema (cambia el cierre de la app y el apagado ordenado del daemon) y editar las carpetas desde la UI (siguen viniendo de `MC_NEXUS_*`).

## Contexto (estado actual verificado)

| Área | Hoy | Problema |
|---|---|---|
| Tema | `hooks/useTheme.ts`: `light`/`dark` en `localStorage['mc-nexus-theme']`, clase `.dark` en `<html>`. Toggle en el pie de `layout/Sidebar.tsx:244-251`. | Sin modo "sistema" (solo se lee al primer arranque), sin presets ni acento. |
| Idioma | `i18n/index.ts`, `localStorage['mc_nexus_lang']`, dropdown en `Sidebar.tsx:225-235`. | Preferencias dispersas en claves sueltas. |
| Tokens | `src/index.css`: `:root` / `.dark` + `@theme inline`. Único archivo con hex (`test/designSystem.test.ts`). | Base buena: un tema = un set de variables. |
| Consola | `tabs/OverviewTab.tsx:431-506` inline: `text-white`, `bg-white/10`, `text-red-400`, `text-[13px]`, `leading-[20px]`. Duplica la lógica de `utils/console.ts` (`getConsoleLineClass`) en vez de usarla. | Colores fuera del sistema de tokens; tamaño/fuente fijos; buffer fijo `MAX_CONSOLE_LINES = 1000` (`state/daemonSocketReducer.ts:13`). |
| Daemon | Todo por env (`config/env.ts`: RAM, Java, carpetas). | No editable desde la UI (fase 4). |

## Decisiones de arquitectura

1. **Vista de Configuración a pantalla completa** (estilo VS Code/Discord), no un modal: estado `view: 'server' | 'settings'` en `App.tsx` (sin router). Se abre con un botón engranaje en el pie del Sidebar y con `Ctrl+,`; `Esc` vuelve. El dropdown de idioma sale del Sidebar; el toggle rápido de tema se queda (ver preguntas).
2. **Un único objeto de preferencias versionado** (`AppPreferences`, `version: 1`) en `localStorage['hosty.preferences']`, con `migrate()` que absorbe `mc-nexus-theme` y `mc_nexus_lang` y luego las borra. Lecturas/escrituras en `try/catch`, defaults si falla. Export/Import como JSON.
3. **Temas = variables CSS, nunca hex en TS** (respeta `designSystem.test.ts`):
   - Presets en `index.css` como `[data-theme="<id>"]` (y `[data-theme="<id>"].dark` si aplica). El registro TS solo conoce ids + claves i18n.
   - Colores personalizados del usuario (acento, tokens editados) son datos en runtime → se aplican como `style.setProperty('--accent', …)` sobre `<html>`. Muestras de acento predefinidas también como variables (`--swatch-blue`, …) en `index.css`.
   - `applyAppearance(prefs, systemIsDark)` es una función pura que devuelve `{ classes, attributes, cssVars }`; un efecto la aplica al DOM. Testeable sin DOM.
4. **Consola con tokens propios**: `--console`, `--console-fg`, `--console-mute`, `--console-border`, `--console-warn`, `--console-error`, `--console-command`, `--console-selection`. Los temas de terminal son presets `[data-console-theme="<id>"]` independientes del tema de la app (se puede tener app clara + terminal oscura).
5. **Registro declarativo de ajustes** (`settings/registry.ts`): cada ajuste = `{ key, section, labelKey, descriptionKey, keywords, control }`. Habilita búsqueda, "restablecer a valor por defecto" por fila y render genérico de filas, sin componentes por ajuste.
6. **Sin dependencias nuevas en fases 1-3** (Radix ya cubre Select/Slider/Switch/Tabs; color con `<input type="color">` envuelto en `ui/ColorPicker`). Fase 4 sí podría necesitar plugins de Tauri → confirmar antes.

### Estructura nueva (client/src)

```
settings/
  schema.ts            AppPreferences, DEFAULT_PREFERENCES, PREFERENCES_VERSION, migrate()
  storage.ts           loadPreferences / savePreferences (+ migración de claves legacy)
  PreferencesContext.tsx  Provider + usePreferences() / useSetPreference(key, value)
  applyAppearance.ts   prefs -> clases/atributos/variables (puro)
  registry.ts          descriptores de ajustes por sección
  themes.ts            ids de presets de app y terminal (sin colores)
components/settings/
  SettingsView.tsx     layout: nav lateral + buscador + contenido
  SettingsNav.tsx
  SettingRow.tsx       label, descripción, control, "restablecer"
  sections/{General,Appearance,Terminal,Servers,Advanced}Section.tsx
  ConsolePreview.tsx   consola con líneas de ejemplo para vista previa en vivo
components/console/
  ConsolePanel.tsx     extraído de OverviewTab (SRP), consume prefs de terminal
components/ui/
  ColorPicker.tsx, SegmentedControl.tsx
```

`hooks/useTheme.ts` se elimina (lo reemplaza el Provider); `i18n/index.ts` lee el idioma inicial vía `storage.ts`.

## Secciones y ajustes

### General
- Idioma (incluye packs de comunidad de `useLocales`).
- Buscar actualizaciones al iniciar (on/off) — hoy solo manual.
- Al abrir: último servidor seleccionado / pantalla de bienvenida.
- Confirmar antes de detener/reiniciar un servidor con jugadores conectados.

### Apariencia
- Modo: Claro / Oscuro / **Sistema** (escucha `matchMedia('(prefers-color-scheme: dark)')` en vivo).
- Tema de app: presets (Hosty, Alto contraste, Midnight, Nord-like, Solarized-like…; nombres propios para evitar marcas).
- Color de acento: muestras + selector libre; `--accent-fg` se deriva para claro/oscuro con aviso de contraste WCAG (< 4.5:1).
- Editor avanzado de tokens (fase 3): tabla de tokens semánticos con color y "restablecer"; exportar/importar tema como JSON.
- Densidad: cómoda / compacta (`data-density` ajusta paddings vía variables).
- Escala de interfaz 90–125 % (zoom del webview de Tauri en desktop; `zoom` CSS como fallback en navegador).
- Animaciones: sistema / reducidas / desactivadas (complementa el `prefers-reduced-motion` actual de `index.css`).

### Terminal
- Tema de terminal: preset + "seguir tema de la app".
- Fuente: Geist Mono (incluida), Cascadia Mono, Consolas, JetBrains Mono, monospace del sistema; muestra "no instalada" si `document.fonts.check` falla.
- Tamaño de fuente (11–20 px), interlineado (1.2–2.0), ajuste de línea vs scroll horizontal.
- Mostrar/ocultar timestamp, resaltado de niveles (WARN/ERROR/comando) on/off.
- **Reglas de resaltado personalizadas**: regex + color de token (ej. `joined the game` en verde). Validación de regex y límite de reglas.
- Autoscroll: siempre / solo si estoy abajo (actual, `CONSOLE_FOLLOW_THRESHOLD_PX`) / nunca.
- Tamaño del buffer: 500–10 000 líneas (el reducer recibe el límite; sigue siendo puro).
- Historial de comandos con ↑/↓ y tamaño del historial (persistido por instancia).
- Comandos rápidos: ocultar los del driver y añadir propios (por juego, sin `gameId ===`: se guardan bajo la clave del driver).
- Limpiar consola al reiniciar el servidor.

### Servidores (fase 4, daemon)
- Valores por defecto para nuevos servidores: RAM, Java por defecto (desde `EnvironmentDetector`), autostart.
- Carpetas (instancias, games, locales): solo lectura + "Abrir carpeta"; cambiarlas requiere reinicio del daemon.
- Persistencia en el daemon: `GET/PUT /api/preferences/daemon` → `<appData>/Hosty/settings.json`; env sigue teniendo prioridad.

### Avanzado
- Exportar / importar / restablecer todas las preferencias (con confirmación).
- Abrir logs del daemon (`open_daemon_logs` ya existe), URL del daemon y versión.
- Datos simulados (solo dev, mueve el botón `onMock` del Sidebar).

## Fases (una PR por fase, rama `feature/app-settings-<fase>`)

| Fase | Alcance | Criterio de cierre |
|---|---|---|
| 1. Infraestructura + shell | `settings/*`, migración de claves, Provider, `SettingsView` con nav/buscador, General + Apariencia básica (modo con Sistema, acento con muestras), botón engranaje + `Ctrl+,`, quitar idioma del Sidebar. | Preferencias antiguas migradas sin pérdida; vista navegable; tests verdes. |
| 2. Terminal | Tokens de consola en `index.css`, extraer `ConsolePanel` (usa `getConsoleLineClass`), presets de terminal, fuente/tamaño/interlineado/wrap, autoscroll, buffer configurable, historial, reglas de resaltado, `ConsolePreview`. | Sin `text-white`/`text-red-400` en la consola; cambios en vivo en la vista previa y la consola real. |
| 3. Theming avanzado | Presets de app, editor de tokens, aviso de contraste, import/export de temas, densidad, escala, animaciones. | Cambiar tema no requiere recargar; contraste avisado. |
| 4. Daemon y sistema | Defaults de servidores y endpoint de preferencias del daemon; opcional: iniciar con Windows / minimizar a bandeja (plugins Tauri). | Requiere aprobación de dependencias. |

Versión: fase 1 sube a `0.4.0` (nuevo conjunto de funciones); fases siguientes `0.4.x`, en todos los archivos listados en AGENTS.md.

## Tests

- `test/preferences.test.ts`: defaults, `migrate()` desde claves legacy y desde versiones futuras/corruptas, storage que lanza excepción.
- `test/applyAppearance.test.ts`: modo sistema, preset + acento, variables de consola, densidad.
- `test/console.test.ts`: `getConsoleLineClass` con reglas personalizadas y regex inválidas; reducer con límite configurable (`daemonSocketReducer.test.ts`).
- `test/settingsRegistry.test.ts`: cada ajuste tiene claves i18n existentes y sección válida.
- `i18nParity.test.ts`, `noHardcodedStrings.test.ts`, `designSystem.test.ts` deben seguir pasando (nuevas claves bajo `settings.*` en `en.json` y `es.json`).
- Playwright: abrir con `Ctrl+,`, cambiar a oscuro, cambiar tamaño de fuente de terminal, recargar y verificar persistencia.
- Regenerar `docs/screenshots/` (`npm --prefix client run screenshots`).

## Preguntas abiertas (recomendación primero)

1. **Persistencia de preferencias de UI**: solo cliente (`localStorage`) **(recomendado: simple y suficiente; el origen del webview de Tauri es estable)** vs. guardarlas también en el daemon (sobreviven a borrar datos del webview, más trabajo).
2. **Toggle rápido de tema en el Sidebar**: mantenerlo junto al engranaje **(recomendado)** vs. moverlo solo a Configuración.
3. **Fase 4 con plugins de Tauri** (`tauri-plugin-autostart`, bandeja del sistema): incluir vs. dejar fuera por ahora.
