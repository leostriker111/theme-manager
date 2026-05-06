# Guía de Documentación — Theme Manager

Este documento establece cómo y dónde documentar cada cambio en el proyecto. Todos los contribuidores deben seguirla antes de hacer merge a `main`.

---

## Estructura de `docs/`

La carpeta `docs/` tiene dos tipos de documentos: los **documentos vivos** que se actualizan con cada versión y reflejan el estado actual del sistema, y los **documentos de versión** que son históricos e inmutables una vez que se cierra una versión.

```
docs/
├── arquitectura.md          ← Doc viva: estado actual de la arquitectura
├── contribucion.md          ← Doc viva: cómo contribuir al proyecto
├── guia_documentacion.md    ← Doc viva: este archivo
└── versiones/
    ├── v3.4.0/
    │   ├── auditoria.md     ← Auditoría de la refactorización
    │   └── refactor_log.md  ← Log de decisiones de diseño
    └── v3.4.1/
        └── changelog.md     ← Qué se añadió en esta versión
```

La carpeta `.documentacion/` (con punto, oculta en git) es documentación privada del desarrollo: planes de implementación, notas de sesión, experimentos. No es pública ni se empaqueta en el `.vsix`.

---

## Qué Documentar en Cada Archivo

### `docs/arquitectura.md` — Actualizar cuando:
- Se añade un nuevo módulo (provider, handler o archivo de webview)
- Cambia la relación entre módulos existentes (composición, dependencias)
- Se añade un método público a una clase
- Cambia el flujo de un mensaje entre webview y Extension Host

Siempre mantener el diagrama de clases y las tablas de referencia de métodos sincronizados con el código real. Si añades un método en `BackgroundManager.js`, su fila va en la tabla de `arquitectura.md`.

### `docs/contribucion.md` — Actualizar cuando:
- Cambias una convención de nomenclatura
- Cambias el patrón de manejo de errores
- Añades un nuevo tipo de dominio (nuevo archivo en `src/handlers/`)
- Cambias el proceso para reportar bugs

### `docs/versiones/vX.Y.Z/` — Crear cuando cierras una versión:

Al empezar a trabajar en una nueva versión, crea su carpeta:
```
docs/versiones/v3.5.0/
```

Al cerrar la versión, escribe ahí los documentos que apliquen:

| Archivo | Cuándo escribirlo |
|---|---|
| `changelog.md` | Siempre. Lista qué se añadió, cambió y corrigió. |
| `auditoria.md` | Cuando hiciste una auditoría técnica del código |
| `refactor_log.md` | Cuando hiciste una refactorización significativa |
| `decisiones.md` | Cuando tomaste decisiones de arquitectura difíciles |

---

## Formato del `changelog.md` de Versión

Usa este formato mínimo para documentar lo que hiciste:

```markdown
# Changelog v3.X.Y

## Contexto
Breve descripción de por qué existe esta versión.

## Añadido
- Descripción de cada feature nueva con el archivo que la implementa.

## Cambiado
- Qué cambió del comportamiento existente.

## Corregido
- Bugs específicos, con descripción del síntoma y la causa.

## Archivos modificados
Lista de archivos tocados para facilitar el code review.
```

---

## Regla de Oro

**Si lo codificaste, documentalo.** Un feature sin documentar no existe para quien lo lea en 6 meses. La documentación no es opcional: es parte del criterio de "terminado" de cualquier tarea.

Si no sabes dónde va algo, ponlo en `docs/versiones/vX.Y.Z/notas.md` y se revisa en la siguiente sesión.
