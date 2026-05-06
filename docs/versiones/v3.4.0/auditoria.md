# Auditoría Técnica: v3.3.2 → v3.4.0

**Proyecto:** Theme Manager By Leostriker
**Fecha:** Mayo 2026
**Alcance:** Refactorización estructural post-limpieza SOLID (Fases 1-3)

---

## Resumen Ejecutivo

El proyecto ha mejorado significativamente respecto a la versión anterior. El HTML dejó de estar hardcodeado dentro del JS, existe separación real entre `ThemeCreator` y `BackgroundManager`, y los handlers ya no son un bloque `switch`. Sin embargo, persisten problemas que van a hacer el proyecto inmantenible a medida que crece. Este documento los cataloga y propone la solución arquitectónica final.

---

## Hallazgos por Archivo

### `src/providers/GalleryViewProvider.js` — CRÍTICO

El nombre "Gallery" ya no describe lo que hace este archivo. Es el **orquestador central** de la extensión, no una galería. El problema principal es que el método `_buildHandlers()` concentra ~200 líneas con handlers de 5 dominios completamente distintos mezclados en un solo objeto. A medida que se añaden funciones, este archivo crece indefinidamente sin ningún límite natural. No hay forma de saber qué handlers pertenecen a qué pestaña sin leer todo el bloque.

**Hallazgos específicos:**

- Nombre incorrecto (`GalleryViewProvider` debería ser `ThemeManagerProvider` o `PanelProvider`)
- `_buildHandlers()` mezcla lógica de 5 dominios: temas de color, iconos, fondo, UI y creator
- La referencia directa `this.scanner._colorThemesCache = null` rompe el encapsulamiento de `ThemeScanner` (acceso directo a una propiedad privada desde afuera)
- `_sendCustomThemes` es un método de solo 3 líneas que solo existe para envolver `postMessage`, podría ser inline

### `src/extension.js` — ERROR DE LÓGICA

En `deactivate()`, se llama `mainProvider.creator.restoreOriginalState()`, pero `creator` es ahora `ThemeCreator` que fue limpiado y **ya no tiene ese método**. La limpieza al desactivar la extensión está rota. Se debe llamar a `mainProvider.bgManager.restoreOriginalState()`.

### `src/providers/ThemeScanner.js` — MENOR

- `_colorThemesCache` y `_iconThemesCache` son propiedades "privadas por convención" pero se acceden y modifican desde `GalleryViewProvider` directamente (`this.scanner._colorThemesCache = null`). Debe existir un método público `invalidateCache()` para hacer esto correctamente.

### `src/webview/index.html` — ADVERTENCIAS DE LINTER

El linter de Microsoft Edge Tools reporta advertencias de accesibilidad. Ninguna impide el funcionamiento, pero deben corregirse:

- **Estilos inline** en 8+ elementos: `style="margin-right:auto"`, `style="display:none"`, `style="display:flex; ..."`, etc. Deben moverse a `styles.css`.
- **`<input type="checkbox">` sin `<label>` asociado** (`for`/`id`): los checkboxes del Master Switch y controles UI no tienen labels accesibles correctamente vinculados.
- **`<select id="copyFromTheme">` sin `title`**: el selector de temas base no tiene nombre accesible.
- **`<input type="color">` sin labels**: los inputs de color del creator no tienen labels visibles vinculados formalmente.

### `package.json` — MENOR

- La versión dice `3.3.2` pero el código ya pasó por una refactorización estructural completa. Debe actualizarse a `3.4.0`.
- Falta la propiedad `themeManager.masterSwitchActive` en la sección `configuration.properties`. El setting existe en código pero no está declarado en el manifiesto.

### `src/providers/BackgroundManager.js` — LIMPIO

Sin observaciones. El módulo es coherente, tiene una sola responsabilidad y está bien documentado.

### `src/providers/ThemeCreator.js` — LIMPIO

Sin observaciones tras la limpieza.

### `src/providers/SettingsManager.js` — MENOR

- El campo `lastVersion: '3.3.1'` está hardcodeado en `getSettings()` pero nunca se usa ni se actualiza. Es dead code.

---

## Propuesta de Arquitectura: Handlers por Dominio

La solución al problema de escalabilidad de `_buildHandlers()` es mover cada grupo de handlers a su propio módulo en `src/handlers/`. Cada módulo es una función que recibe las dependencias necesarias (`settings`, `scanner`, `bgManager`, etc.) y devuelve un objeto con sus handlers. El `GalleryViewProvider` (renombrado) simplemente los fusiona con `Object.assign`.

```
src/
├── extension.js
├── providers/
│   ├── PanelProvider.js          ← renombrado desde GalleryViewProvider
│   ├── ThemeScanner.js
│   ├── ThemeCreator.js
│   ├── BackgroundManager.js
│   └── SettingsManager.js
├── handlers/
│   ├── themeHandlers.js          ← applyTheme, toggleFavorite, requestAddTag, removeTag, deleteTagGlobally
│   ├── iconHandlers.js           ← applyIconTheme
│   ├── backgroundHandlers.js     ← applyBackground, removeBackground, masterSwitch, openFilePicker
│   ├── uiHandlers.js             ← updateUISettings
│   └── creatorHandlers.js        ← saveCustomTheme, loadThemeColors, requestState
└── webview/
    ├── index.html
    ├── styles.css
    └── main.js
```

Cuando se añade un botón nuevo, solo se toca el archivo de handlers de ese dominio. El `PanelProvider` no crece nunca más.

---

## Plan de Cambios v3.4.0

| # | Archivo                    | Cambio                                                                                 | Prioridad     |
| - | -------------------------- | -------------------------------------------------------------------------------------- | ------------- |
| 1 | `extension.js`           | Corregir bug:`creator.restoreOriginalState` → `bgManager.restoreOriginalState`    | 🔴 Crítico   |
| 2 | `ThemeScanner.js`        | Agregar método `invalidateCache()` público                                         | 🟡 Importante |
| 3 | `GalleryViewProvider.js` | Renombrar a `PanelProvider.js`                                                       | 🟡 Importante |
| 4 | Crear `src/handlers/`    | Extraer los 5 grupos de handlers a módulos separados                                  | 🟡 Importante |
| 5 | `PanelProvider.js`       | `_buildHandlers` pasa a ser una fusión de los 5 módulos                            | 🟡 Importante |
| 6 | `index.html`             | Eliminar todos los estilos inline, moverlos a `styles.css`                           | 🟢 Normal     |
| 7 | `index.html`             | Agregar `aria-label` y vincular labels a inputs                                      | 🟢 Normal     |
| 8 | `package.json`           | Versión 3.3.2 → 3.4.0, agregar `masterSwitchActive` a `configuration.properties` | 🟢 Normal     |
| 9 | `SettingsManager.js`     | Eliminar dead code `lastVersion`                                                     | 🟢 Normal     |
