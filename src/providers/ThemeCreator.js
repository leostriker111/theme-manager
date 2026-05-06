// providers/ThemeCreator.js
// Responsabilidad ÚNICA: creación y gestión de temas de color personalizados.
// Solo manipula archivos JSON de temas y la configuración de VS Code relacionada.
// La inyección de imagen de fondo fue separada al módulo BackgroundManager.js.

const vscode = require('vscode');
const fs     = require('fs');
const path   = require('path');

class ThemeCreator {

    constructor(context) {
        this.context = context;
        // Carpeta donde guardamos los archivos JSON de los temas personalizados del usuario.
        // Usa el globalStorageUri para que persista entre sesiones sin contaminar el proyecto.
        this.customThemesDir = path.join(context.globalStorageUri.fsPath, 'custom-themes');
        this._ensureDir(this.customThemesDir);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEMAS PERSONALIZADOS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Guarda un tema personalizado como archivo JSON en el almacenamiento global
     * y lo registra en la configuración de VS Code para que sea reconocido.
     * @param {string} name   - Nombre visible del tema.
     * @param {object} colors - Mapa de tokens de color VS Code a valores hex.
     * @returns {string} Ruta del archivo JSON generado.
     */
    async saveCustomTheme(name, colors) {
        const fileName = `${this._sanitizeName(name)}.json`;
        const filePath = path.join(this.customThemesDir, fileName);

        const themeJson = {
            name,
            type: colors['editor.background']
                ? this._guessThemeType(colors['editor.background'])
                : 'dark',
            colors: { ...colors },
            tokenColors: []
        };

        fs.writeFileSync(filePath, JSON.stringify(themeJson, null, 2), 'utf-8');

        // Registrar el tema en la lista de temas personalizados persistida en la configuración global.
        const cfg = vscode.workspace.getConfiguration('themeManager');
        const existing = cfg.get('customThemes') || [];
        const updated = [...existing.filter(t => t.name !== name), { name, path: filePath }];
        await cfg.update('customThemes', updated, vscode.ConfigurationTarget.Global);

        return filePath;
    }

    /**
     * Lee el archivo JSON de un tema instalado y retorna sus colores.
     * Se usa para la función "Copiar y editar" de la pestaña Crear.
     * @param {string} themeLabel - Label o ID del tema a cargar.
     * @returns {object|null} JSON del tema, o null si no se encontró.
     */
    async loadThemeColors(themeLabel) {
        for (const ext of vscode.extensions.all) {
            const pkg = ext.packageJSON;
            if (!pkg?.contributes?.themes) continue;

            for (const t of pkg.contributes.themes) {
                if ((t.label || t.id) === themeLabel) {
                    const themeFile = path.join(ext.extensionPath, t.path);
                    if (fs.existsSync(themeFile)) {
                        try {
                            const raw = fs.readFileSync(themeFile, 'utf-8');
                            // Los archivos de tema pueden tener comentarios // y /* */
                            // que no son JSON válido, así que los quitamos antes de parsear.
                            const clean = raw
                                .replace(/\/\/.*$/gm, '')
                                .replace(/\/\*[\s\S]*?\*\//g, '');
                            return JSON.parse(clean);
                        } catch (e) {
                            console.error('[Theme Manager] Error al leer tema:', themeFile, e.message);
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Retorna la lista de temas personalizados guardados por el usuario.
     * @returns {Array<{name: string, path: string}>}
     */
    getCustomThemes() {
        const cfg = vscode.workspace.getConfiguration('themeManager');
        return cfg.get('customThemes') || [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILIDADES PRIVADAS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Sanitiza el nombre del tema para usarlo como nombre de archivo válido.
     * Permite caracteres alfanuméricos, guiones, guiones bajos y letras con acento.
     */
    _sanitizeName(name) {
        return name
            .replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, '')
            .trim()
            .replace(/\s+/g, '-');
    }

    /**
     * Estima si un tema es oscuro o claro según la luminancia de su color de fondo.
     * Usa la fórmula estándar de luminancia relativa del modelo YIQ.
     */
    _guessThemeType(bgColor) {
        const hex = bgColor.replace('#', '');
        if (hex.length < 6) return 'dark';
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        return luminance < 128 ? 'dark' : 'light';
    }

    _ensureDir(dir) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
}

module.exports = ThemeCreator;
