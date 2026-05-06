# Registro de Refactorización (Theme Manager)

Este documento mantiene un registro técnico progresivo de los cambios realizados durante la refactorización profunda de la extensión. Todo el contenido aquí registrado se utilizará posteriormente para actualizar la documentación general del proyecto (`docs/`).

## Fase 1: Limpieza del HTML Sucio
**Estado:** Completada.

### ¿Qué se hizo?
*   **Extracción:** Se removió la plantilla gigante de código HTML que residía dentro de un bloque *template string* en el método `_buildHtml()` de la clase `GalleryViewProvider.js`.
*   **Nuevo Archivo:** Se creó el archivo `src/webview/index.html`.
*   **Inyección Dinámica:** Se actualizó `GalleryViewProvider.js` para usar `fs.readFileSync` apuntando a `index.html`, reemplazando variables dinámicas como `{{nonce}}`, `{{cssUri}}`, y `{{cspSource}}`.

### Detalles Técnicos e Impacto para la Documentación

Durante la refactorización de la carga del HTML, se implementó el módulo nativo `fs` (File System) de Node.js, específicamente la función `fs.readFileSync`. Esta tecnología permite al hilo principal de Node leer el contenido de un archivo de forma síncrona directamente desde el disco duro antes de continuar con la ejecución de la siguiente línea de código, garantizando así que la interfaz no intente cargarse antes de que el código HTML esté disponible. A diferencia de las lecturas asíncronas, el enfoque síncrono es perfectamente aceptable aquí porque esta acción ocurre únicamente durante la inicialización inicial del panel de la extensión y el archivo de texto es extremadamente liviano, por lo que no provoca bloqueos perceptibles en la experiencia del usuario.

Para enlazar el contenido estático leído del disco con el entorno de seguridad estricto de Visual Studio Code, se hizo uso de expresiones regulares globales (Regex) mediante el método `.replace()`. Las expresiones regulares permiten identificar patrones de texto, en este caso marcadores personalizados como `{{nonce}}` o `{{cspSource}}`, y sustituirlos por los valores reales en tiempo de ejecución. Al usar el flag `g` en la expresión (por ejemplo, `/{{cssUri}}/g`), nos aseguramos de que el motor de JavaScript reemplace todas las apariciones de ese comodín en todo el archivo HTML y no solo la primera coincidencia que encuentre. Este mecanismo casero de "templating" evita tener que incorporar dependencias pesadas de terceros solo para inyectar tres o cuatro variables de configuración, manteniendo la filosofía original del proyecto de ser rápido, puro y sin dependencias externas.

A nivel arquitectónico, la vista web ahora se renderiza desde `src/webview/index.html` y ya no es generada directamente en memoria por el Provider. Esto respeta plenamente el Principio de Responsabilidad Única (SRP), separando limpiamente la estructura visual (HTML) de la lógica de comunicación y ciclo de vida que maneja `GalleryViewProvider.js`.

---

## Fase 2: Muerte al Switch Gigante (Patrón Handler)
**Estado:** Completada.

### ¿Qué se hizo?
*   **Eliminado:** El bloque `switch(msg.command)` de más de 200 líneas en `_handleMessage()`.
*   **Nuevo método `_buildHandlers()`:** Retorna un objeto literal donde cada clave es el nombre de un comando (e.g. `'applyTheme'`) y cada valor es una función `async (msg, webview) => void` responsable de ese comando.
*   **Nuevo método `_dispatch(msg, webview)`:** Es el punto de entrada único. Busca el handler en el mapa y lo ejecuta. Si el comando no existe, lo registra en consola con `console.warn` en lugar de fallar silenciosamente.

### Detalle Técnico: ¿Por qué Arrow Functions?
El objeto de handlers usa *arrow functions* en lugar de funciones normales por una razón crucial: en JavaScript, el valor de `this` dentro de una función depende de *cómo* se llama esa función, no de dónde está escrita. Si `_buildHandlers` devolviera métodos normales (`applyTheme: async function(msg)...`), al llamarlos como `handler(msg, webview)`, el `this` sería `undefined` en modo estricto y los handlers no podrían acceder a `this.bgManager`, `this.settings`, etc. Las arrow functions en cambio capturan el `this` del contexto donde *fueron creadas* (el constructor de la clase), es decir, siempre apuntan a la instancia correcta del `GalleryViewProvider`. Esto elimina la necesidad de usar `.bind(this)` en cada handler.

### Impacto para la Documentación
Al documentar el **flujo de mensajes WebView ↔ Extension**, el diagrama de secuencia debe mostrar que el mensaje pasa por `_dispatch()` antes de llegar al handler específico. Añadir un diagrama del mapa de handlers si se actualiza el `arquitectura.md`.

---

## Fase 3: División del ThemeCreator (Principio SRP)
**Estado:** Completada.

### ¿Qué se hizo?
*   **Nuevo módulo `BackgroundManager.js`:** Extracción completa de toda la lógica de inyección de CSS del workbench de VS Code. Este archivo es el único responsable de `applyBackground`, `removeBackground`, `restoreOriginalState`, `_applyTransparency`, `_getWorkbenchCSSPath`, `_removeInjection` y `_createExternalBackup`.
*   **`ThemeCreator.js` limpiado:** Ahora solo contiene `saveCustomTheme`, `loadThemeColors` y `getCustomThemes`. Su responsabilidad es exclusivamente la gestión de archivos JSON de temas personalizados.
*   **`GalleryViewProvider.js` actualizado:** Instancia `BackgroundManager` y llama a sus métodos en los handlers correspondientes.

### Detalle Técnico: El Principio de Responsabilidad Única (SRP)
El SRP, el primero de los principios SOLID, establece que una clase debe tener **una sola razón para cambiar**. La clase original `ThemeCreator` tenía *dos razones* para cambiar: si el equipo de VS Code cambia la ruta del CSS del workbench (cambio de entorno externo), y si el usuario quiere guardar más colores en sus temas JSON (cambio de lógica de negocio). Al separar en dos clases, cada módulo ahora tiene una sola razón para cambiar, lo que hace que el código sea mucho más fácil de depurar, probar y mantener.

---

## Bug Fixes Encontrados y Corregidos

### Bug 1: `return` dentro de `switch/case` en función `async`
*   **Archivo:** `GalleryViewProvider.js`, handler `openFilePicker`.
*   **Problema:** Se usaba `return` para salir del `case` cuando el formato de imagen no era válido. En una función `async` esto termina la promesa completa del `_handleMessage`, lo que puede interferir con la gestión de errores del llamador. Además es un anti-patrón confuso.
*   **Solución:** El handler fue reescrito para usar guardas al inicio (`if (!uris || ...) return;`) en lugar de `return` dentro de un `switch`. El flujo ahora es lineal y legítimo.

### Bug 2: Variable `alpha` calculada pero nunca usada (Dead Code)
*   **Archivo:** `ThemeCreator.js`, método `applyTransparency`.
*   **Problema:** Se calculaban `alphaNum` y `alpha` con la intención de usarlos en los colores de transparencia, pero luego todos los valores estaban hardcodeados como `#00000000`.
*   **Solución:** En `BackgroundManager.js`, el método `_applyTransparency` fue simplificado para ser honesto sobre lo que hace: aplica `#00000000` (completamente transparente) sin cálculos muertos.

### Bug 3: `_removeInjection` acumulaba líneas vacías
*   **Archivo:** `ThemeCreator.js` / `BackgroundManager.js`.
*   **Problema:** Cada vez que se aplicaba un fondo, se añadía `'\n' + cssToInject` al final del archivo. Al remover, se cortaba el contenido desde el marcador pero no se quitaba el `\n` previo. Con varias aplicaciones, el archivo del workbench acumulaba líneas vacías.
*   **Solución:** En `BackgroundManager._removeInjection()`, se detecta si el carácter anterior al marcador es un `\n` y se incluye en el rango a eliminar.

### Bug 4: `masterSwitchActive` se dedíuca incorrectamente
*   **Archivo:** `GalleryViewProvider.js`, método `_sendState`.
*   **Problema:** El valor de `masterSwitchActive` se calculaba como `!!(bgPath && fs.existsSync(bgPath))`. Si el usuario apagaba el Master Switch pero el archivo de imagen seguía existiendo, el webview lo mostraba como *activo*.
*   **Solución:** Se agregó `masterSwitchActive` como campo persistido en `SettingsManager`. El webview ahora recibe el estado real del interruptor en lugar de una inferencia.
