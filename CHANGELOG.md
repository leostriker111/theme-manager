# Changelog — Theme Manager

Todos los cambios notables de este proyecto se documentan en este archivo. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y el versionado sigue [Semantic Versioning](https://semver.org/lang/es/).

---

## [3.4.0] — 2026-05-06

### Arquitectura — Refactorización Mayor

Esta versión es una refactorización estructural completa. La funcionalidad de cara al usuario es idéntica a la v3.3.2, pero el código interno fue reorganizado para ser escalable, legible y mantenible a largo plazo.

#### Añadido
- `src/handlers/` — Nueva carpeta con 5 módulos de handlers, uno por dominio de UI:
  - `themeHandlers.js` — Temas de color, favoritos y etiquetas.
  - `iconHandlers.js` — Packs de iconos.
  - `backgroundHandlers.js` — Imagen de fondo y Master Switch.
  - `uiHandlers.js` — Personalización de la interfaz con `SETTINGS_MAP` declarativo.
  - `creatorHandlers.js` — Creador de temas personalizados.
- `src/providers/PanelProvider.js` — Nuevo orquestador que reemplaza a `GalleryViewProvider.js`. Fusiona los handlers con `Object.assign` y no crece al añadir funcionalidades.
- `src/providers/BackgroundManager.js` — Módulo dedicado exclusivamente a la inyección de CSS en el workbench.
- `ThemeScanner.invalidateCache()` — Método público para invalidar el caché sin acceder a propiedades internas.
- `docs/arquitectura.md` — Documentación técnica completa de la arquitectura.
- `docs/contribucion.md` — Guía de contribución con convenciones y antipatrones.
- `docs/auditoria_v3.3.2_a_v3.4.0.md` — Auditoría técnica de la migración.
- `package.json` — Declaración de `themeManager.masterSwitchActive` en `configuration.properties`.

#### Cambiado
- `src/providers/ThemeCreator.js` — Limpiado: ya no contiene lógica de CSS/background. Solo gestiona archivos JSON de temas.
- `src/providers/SettingsManager.js` — Agrega soporte para `masterSwitchActive`. Eliminado dead code `lastVersion`.
- `src/webview/index.html` — Eliminados todos los estilos `style=""` inline. Todos los inputs tienen `aria-label` y sus labels están vinculados con `for`/`id`.
- `src/webview/styles.css` — Nuevas clases utilitarias: `.btn-push-right`, `.bg-preview-img`, `.master-switch-row`, `.control-row--inline`, `.section-header--spaced`, etc.
- `.vscodeignore` — Agregado `docs/**` para que la documentación técnica no se empaquete en el `.vsix`.
- `README.md` — Reescrito completamente con diagramas Mermaid, tabla de contenidos y badges.

#### Corregido
- **Bug crítico:** `extension.js deactivate()` llamaba a `creator.restoreOriginalState()` que no existe en la versión limpia de `ThemeCreator`. Ahora llama correctamente a `bgManager.restoreOriginalState()`.
- **Bug:** `_removeInjection()` no eliminaba el `\n` previo al marcador CSS, acumulando líneas vacías en el workbench CSS con cada aplicación de fondo.
- **Bug:** `masterSwitchActive` se deducía de si existía el archivo de imagen. Ahora se persiste explícitamente en la configuración.
- **Bug:** Dead code de variable `alpha` calculada pero nunca usada en el antiguo `applyTransparency`.

---

## [3.3.2] — 2026-05-04

### Añadido
- `src/webview/index.html` — El HTML del webview fue extraído del código JS a un archivo estático independiente (Fase 1 de refactorización).
- `src/providers/BackgroundManager.js` — Primera extracción de la lógica de inyección de CSS.
- `src/providers/ThemeCreator.js` — Primera limpieza del ThemeCreator.
- `src/providers/SettingsManager.js` — Módulo de gestión de configuración.
- `docs/refactor_log.md` — Registro técnico de decisiones de diseño.

### Cambiado
- `GalleryViewProvider._buildHtml()` — Pasa de generar HTML en memoria a leer `index.html` desde disco con `fs.readFileSync` e inyectar variables mediante regex globales.
- `GalleryViewProvider._handleMessage()` — Reemplazado el bloque `switch/case` monolítico por el patrón Handler con `_buildHandlers()` y `_dispatch()`.

---

## [3.3.1] — 2026-05-02

### Añadido
- Reactividad en tiempo real en los controles de UI (antes requería un botón "Aplicar").
- Empaquetado de la extensión como `.vsix` para distribución.
- Soporte para etiquetas (`tags`) en temas de color.
- Botón aleatorio con modo "solo favoritos".

---

## [3.3.0] — 2026-04-16

### Añadido
- Sistema de imagen de fondo con control de opacidad.
- Interruptor Maestro para activar/desactivar inyecciones de CSS.
- Filtrado de temas por etiquetas con búsqueda `#tag`.

---

## [3.2.x] y anteriores

Versiones iniciales con la funcionalidad base de galería de temas e iconos.
