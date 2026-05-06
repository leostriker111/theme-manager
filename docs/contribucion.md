# Guía de Contribución — Theme Manager

Bienvenido al código de Theme Manager. Este documento te explica cómo está organizado el proyecto, cuáles son las convenciones que seguimos, y cómo agregar funcionalidades de forma que el código escale ordenadamente.

---

## Antes de Contribuir

Lee `docs/arquitectura.md` para entender la separación de responsabilidades entre módulos. Luego lee `docs/refactor_log.md` para entender *por qué* se tomaron las decisiones de diseño actuales. Muchas decisiones que podrían parecer arbitrarias tienen una razón específica documentada ahí.

---

## Convenciones del Código

### Nomenclatura

Los archivos de providers usan `PascalCase` porque exportan clases: `PanelProvider.js`, `ThemeScanner.js`. Los archivos de handlers usan `camelCase` con sufijo `Handlers` porque exportan funciones: `themeHandlers.js`, `uiHandlers.js`. Los archivos del webview usan nombres estándar web: `index.html`, `styles.css`, `main.js`.

Las propiedades "privadas" se prefijan con `_` por convención (JavaScript no tiene privacidad real en clases sin `#`): `_view`, `_handlers`, `_buildHtml()`. Los métodos públicos que VS Code invoca no llevan prefijo: `resolveWebviewView()`, `refresh()`, `syncCurrentTheme()`.

### Comentarios

Los bloques de sección en archivos largos usan el separador visual:
```js
// ─────────────────────────────────────────────────────────────────────────
// NOMBRE DE LA SECCIÓN
// ─────────────────────────────────────────────────────────────────────────
```

Los comentarios de línea explican el *por qué*, no el *qué*. Si el código ya dice lo que hace, el comentario debe decir por qué se hace así y no de otra forma.

### Manejo de errores

Todo acceso al sistema de archivos (en `BackgroundManager.js`) va dentro de `try/catch`. El `catch` distingue entre errores de permisos (`EACCES`, `EPERM`) y errores genéricos, mostrando mensajes diferentes al usuario. No se usa `console.error` para errores que el usuario debe ver; esos siempre van a `vscode.window.showErrorMessage`.

---

## Cómo Añadir un Control Nuevo en la Pestaña UI

La pestaña UI tiene el sistema más declarativo. Agregar un nuevo slider o checkbox es un proceso de 3 pasos que no toca el orquestador:

**Paso 1:** En `src/webview/index.html`, añade el elemento HTML con su `id`:
```html
<div class="control-row">
    <label for="cursorBlinking">Parpadeo del cursor</label>
    <input type="text" id="cursorBlinking" aria-label="Estilo de parpadeo del cursor"/>
</div>
```

**Paso 2:** En `src/webview/main.js`, conecta el evento para que envíe el mensaje. Sigue el patrón existente de los otros controles.

**Paso 3:** En `src/handlers/uiHandlers.js`, añade una entrada al `SETTINGS_MAP`:
```js
cursorBlinking: key => [['editor.cursorBlinking', key]]
```

Eso es todo. El handler `updateUISettings` ya sabe iterar el mapa automáticamente.

---

## Cómo Añadir un Comando Completamente Nuevo

Si el nuevo comando no encaja en ningún dominio existente, estos son los pasos completos:

1. **Crear el archivo de handler** en `src/handlers/miDominioHandlers.js`. Exportar una función fábrica `createMiDominioHandlers(deps)` que retorne un objeto de handlers.

2. **Importarlo en `PanelProvider.js`**:
```js
const { createMiDominioHandlers } = require('../handlers/miDominioHandlers');
```

3. **Fusionarlo en `_buildHandlers()`**:
```js
return Object.assign(
    {},
    // ... handlers existentes ...
    createMiDominioHandlers({ /* dependencias que necesite */ })
);
```

4. **Añadir el HTML** en `index.html` y **conectar el evento** en `main.js`.

El `PanelProvider.js` solo crece en el bloque `Object.assign` — una línea por dominio nuevo.

---

## Cómo NO Hacer las Cosas

**No accedas a propiedades privadas de otros módulos directamente.** Si necesitas invalidar el caché de `ThemeScanner`, llama a `scanner.invalidateCache()`, no a `scanner._colorThemesCache = null`. Si el método que necesitas no existe, añádelo al módulo correspondiente.

**No pongas lógica de negocio en `PanelProvider.js`.** Si un handler necesita hacer más de una llamada a una API externa, esa lógica va en el módulo de dominio (provider o handler), no en el orquestador.

**No uses `style=""` en el HTML.** Todos los estilos van en `styles.css`. Si necesitas un estilo condicional, usa una clase CSS y añádela/remuévela desde JavaScript.

**No uses `console.log` para depurar en producción.** Usa `console.warn` para comandos desconocidos y `console.error` solo para errores internos que el usuario no puede resolver. Todo lo que el usuario deba ver va en `vscode.window.show*Message`.

---

## Regla de Documentación Obligatoria

Toda contribución que modifique el comportamiento de la extensión debe incluir la documentación correspondiente. Esto no es opcional. Si añadiste un método a un provider, actualiza la tabla de métodos en `docs/arquitectura.md`. Si añadiste una feature nueva, escribe su entrada en `docs/versiones/vX.Y.Z/changelog.md`. Si tomaste una decisión de diseño no obvia, documéntala en `docs/versiones/vX.Y.Z/decisiones.md`.

La guía completa de qué documentar y dónde está en [`docs/guia_documentacion.md`](./guia_documentacion.md).

---

## Reportar Bugs

Al abrir un issue, incluye:
- Versión del IDE (Antigravity / VS Code)
- Sistema operativo y si el IDE se ejecuta como Administrador
- Pasos exactos para reproducir el problema
- Si el bug es de fondos de pantalla: incluye el contenido de `~/Documents/ThemeManager_CSS_Backup_ORIGINAL.css` (o menciona si no existe)
