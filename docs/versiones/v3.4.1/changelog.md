# Changelog v3.4.1

## Contexto

Esta versión añade 6 nuevas funcionalidades al panel interactivo del Theme Manager, todas implementadas siguiendo la arquitectura de handlers por dominio establecida en v3.4.0. Ningún cambio de esta versión creció el orquestador `PanelProvider.js`.

---

## Añadido

- **❤️ Botón corazón en la barra flotante** (`index.html`, `main.js`): Toggle visual que muestra si el tema activo es favorito. Cambia entre 🤍 y ❤️ en tiempo real. Reutiliza el handler `toggleFavorite` existente sin modificarlo.

- **📂 "Ocultar Carpetas" reubicado** (`index.html`, `styles.css`): El botón de toggle de carpetas se movió de la barra inferior flotante a una posición fija justo debajo de la barra de búsqueda y arriba de las carpetas de temas, donde es más intuitivo.

- **🎲 ScrollIntoView al usar Aleatorio** (`main.js`): Al aplicar un tema con el botón Aleatorio, el panel hace scroll automático hasta la carpeta del tema seleccionado y la expande si estaba colapsada. Solo ocurre al presionar el botón Aleatorio, no al navegar manualmente.

- **🔤 Selector de fuentes predefinidas** (`index.html`, `main.js`, `styles.css`): El campo de familia de fuente en la pestaña UI pasó de ser un input de texto a un `<select>` con las 9 fuentes más populares para desarrollo. Si el usuario elige "Escribir manualmente...", aparece un input de texto para fuentes custom.

- **🧘 Botón Modo Zen** (`index.html`, `main.js`, `styles.css`, `uiHandlers.js`): Un botón que oculta de golpe: minimapa, barra de menú, activity bar, status bar, breadcrumbs y botones de acciones del editor. Un botón "Restaurar Todo" devuelve exactamente el estado anterior. Los nuevos toggles también están disponibles individualmente como checkboxes (breadcrumbs, números de línea, botones del editor).

- **✏️ Preview en vivo del Creator** (`creatorHandlers.js`, `main.js`): Al editar cualquier color picker en la pestaña Crear, los cambios se aplican en tiempo real al IDE vía `workbench.colorCustomizations`. Al copiar un tema base con "Copiar", los colores se aplican como preview inmediatamente. Al salir de la pestaña Crear, el preview se resetea limpiamente eliminando solo las claves del Creator.

- **⭐ Favoritos primero en el select del Creator** (`main.js`): El `<select>` "Copiar de" ahora agrupa los favoritos en la parte superior con el icono ⭐ y sus etiquetas visibles, facilitando elegir los temas de referencia más usados.

- **📝 `docs/guia_documentacion.md`** (nueva): Documento que establece qué documentar en cada archivo del proyecto y cuándo hacerlo.

- **📂 `docs/versiones/`** (nueva estructura): Carpeta para historiales por versión. Los docs de auditoría y refactor de v3.4.0 viven en `docs/versiones/v3.4.0/`.

---

## Cambiado

- `docs/contribucion.md`: Agregada sección **"Regla de Documentación Obligatoria"** que exige documentar todo cambio de comportamiento.
- `package.json`: Versión 3.4.1, descripción actualizada con disclaimer explícito sobre la inyección de CSS.
- `uiHandlers.js`: Agregados al `SETTINGS_MAP`: `breadcrumbs`, `lineNumbers`, `editorActions`.
- `styles.css`: Agregada clase utilitaria `.hidden`, estilos para todos los componentes nuevos.

---

## Archivos Modificados

| Archivo | Tipo de cambio |
|---|---|
| `src/handlers/creatorHandlers.js` | Añadidos `previewCreatorColors` y `resetCreatorPreview` |
| `src/handlers/uiHandlers.js` | Añadidos `breadcrumbs`, `lineNumbers`, `editorActions` al SETTINGS_MAP |
| `src/webview/index.html` | Reescrito: botón corazón, toggle carpetas reubicado, Modo Zen, selector de fuentes |
| `src/webview/main.js` | Reescrito: toda la lógica de las 6 nuevas features |
| `src/webview/styles.css` | Añadidos estilos de v3.4.1, clase `.hidden` |
| `docs/contribucion.md` | Regla de documentación obligatoria |
| `docs/guia_documentacion.md` | Nuevo archivo |
| `docs/versiones/v3.4.0/` | Estructura creada, archivos históricos movidos |
| `docs/versiones/v3.4.1/` | Este changelog |
| `package.json` | v3.4.1, disclaimer, `creatorSelectedTheme` |
