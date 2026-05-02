// providers/ThemeCreator.js
// Maneja la creación de temas personalizados y la inyección de imagen de fondo.
// La imagen de fondo se aplica modificando el CSS del workbench de Antigravity,
// usando la misma técnica que extensiones populares como "Background".

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Marcador que usamos para identificar nuestras inyecciones en el CSS
const INJECTION_MARKER_START = '/* [THEME-MANAGER-BG-START] */';
const INJECTION_MARKER_END   = '/* [THEME-MANAGER-BG-END] */';

class ThemeCreator {

    constructor(context) {
        this.context = context;
        // Carpeta donde guardamos los temas personalizados del usuario
        this.customThemesDir = path.join(context.globalStorageUri.fsPath, 'custom-themes');
        this._ensureDir(this.customThemesDir);
        // Ruta del backup externo solicitado por el usuario
        this.externalBackupPath = path.join(os.homedir(), 'Documents', 'ThemeManager_CSS_Backup_ORIGINAL.css');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEMAS PERSONALIZADOS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Guarda un tema personalizado como archivo JSON en el almacenamiento global,
     * y lo registra en la configuración para que Antigravity lo reconozca.
     */
    async saveCustomTheme(name, colors) {
        const fileName = `${this._sanitizeName(name)}.json`;
        const filePath = path.join(this.customThemesDir, fileName);

        const themeJson = {
            name,
            type: colors['editor.background'] ? this._guessThemeType(colors['editor.background']) : 'dark',
            colors: { ...colors },
            tokenColors: []
        };

        fs.writeFileSync(filePath, JSON.stringify(themeJson, null, 2), 'utf-8');

        // Guardamos la lista de temas personalizados en la config del usuario
        const cfg = vscode.workspace.getConfiguration('themeManager');
        const existing = cfg.get('customThemes') || [];
        const updated = [...existing.filter(t => t.name !== name), { name, path: filePath }];
        await cfg.update('customThemes', updated, vscode.ConfigurationTarget.Global);

        return filePath;
    }

    /**
     * Carga los colores de un tema instalado para usarlos como base.
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
                            const clean = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
                            return JSON.parse(clean);
                        } catch (e) {
                            console.error('[Theme Manager] Error:', themeFile, e);
                        }
                    }
                }
            }
        }
        return null;
    }

    getCustomThemes() {
        const cfg = vscode.workspace.getConfiguration('themeManager');
        return cfg.get('customThemes') || [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IMAGEN DE FONDO Y TRANSPARENCIA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Aplica fondo e inyecta transparencia en los colores del tema.
     */
    async applyBackground(imagePath, opacity, webview) {
        const cssFile = this._getWorkbenchCSSPath();
        if (!cssFile) {
            vscode.window.showErrorMessage('[Theme Manager] No se encontró el CSS del workbench.');
            return false;
        }

        // 1. Crear backup externo si no existe
        this._createExternalBackup(cssFile);

        // 2. Formatear la ruta para que el CSS del IDE la entienda (Windows)
        const normalizedPath = imagePath.replace(/\\/g, '/');
        const cssPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
        const finalUrl = `file://${cssPath}`;

        // Inyección simplificada: La imagen se pone en body::after para estar detrás de todo.
        // Hacemos el body transparente para que se vea lo que hay en ::after.
        const cssToInject = `
${INJECTION_MARKER_START}
body {
    background-color: transparent !important;
}
body::after {
    content: " ";
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: -1;
    pointer-events: none;
    background-image: url('${finalUrl}');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    opacity: ${opacity};
}
${INJECTION_MARKER_END}`;

        try {
            let content = fs.readFileSync(cssFile, 'utf-8');
            content = this._removeInjection(content);
            content += '\n' + cssToInject;
            fs.writeFileSync(cssFile, content, 'utf-8');

            // 3. Aplicar transparencia a los colores del tema actual de forma suave
            await this.applyTransparency(true, opacity);

            // Guardar configuración
            const cfg = vscode.workspace.getConfiguration('themeManager');
            await cfg.update('backgroundImagePath', imagePath, vscode.ConfigurationTarget.Global);
            await cfg.update('backgroundOpacity', opacity, vscode.ConfigurationTarget.Global);

            return true;
        } catch (e) {
            this._handleFsError(e);
            return false;
        }
    }

    async applyTransparency(active, opacity) {
        const cfg = vscode.workspace.getConfiguration();
        if (!active) {
            await cfg.update('workbench.colorCustomizations', {}, vscode.ConfigurationTarget.Global);
            return;
        }

        // En lugar de forzar colores, solo hacemos transparentes los fondos principales.
        // Esto permite que el tema mantenga sus colores de fuente y bordes originales.
        const alphaNum = Math.floor((1 - opacity) * 100); 
        const alpha = alphaNum.toString(16).padStart(2, '0');
        
        const customizations = {
            "editor.background": "#00000000",
            "sideBar.background": "#00000000",
            "terminal.background": "#00000000",
            "monaco-workbench.background": "#00000000",
            "breadcrumb.background": "#00000000",
            "editorGroupHeader.tabsBackground": "#00000000",
            "tab.activeBackground": "#00000000",
            "tab.inactiveBackground": "#00000000"
        };

        await cfg.update('workbench.colorCustomizations', customizations, vscode.ConfigurationTarget.Global);
    }

    async removeBackground(silent = false) {
        const cssFile = this._getWorkbenchCSSPath();
        if (!cssFile) return false;

        try {
            let content = fs.readFileSync(cssFile, 'utf-8');
            content = this._removeInjection(content);
            fs.writeFileSync(cssFile, content, 'utf-8');

            // Quitar transparencia
            await this.applyTransparency(false);

            const cfg = vscode.workspace.getConfiguration('themeManager');
            await cfg.update('backgroundImagePath', '', vscode.ConfigurationTarget.Global);

            if (!silent) {
                const reload = await vscode.window.showInformationMessage('[Theme Manager] Fondo eliminado. ¿Recargar?', 'Recargar', 'No');
                if (reload === 'Recargar') vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
            return true;
        } catch (e) {
            if (!silent) this._handleFsError(e);
            return false;
        }
    }

    /**
     * Limpia completamente el CSS y la configuración inyectada.
     * Útil para cuando la extensión se desactiva o por un "Interruptor Maestro".
     */
    async restoreOriginalState() {
        console.log('[Theme Manager] Restaurando estado original (limpieza de inyecciones)...');
        await this.removeBackground(true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILIDADES
    // ─────────────────────────────────────────────────────────────────────────

    _createExternalBackup(source) {
        if (!fs.existsSync(this.externalBackupPath)) {
            try {
                fs.copyFileSync(source, this.externalBackupPath);
                console.log('[Theme Manager] Backup externo creado en:', this.externalBackupPath);
            } catch (e) {
                console.error('[Theme Manager] No se pudo crear backup externo:', e);
            }
        }
    }

    _getWorkbenchCSSPath() {
        try {
            const appRoot = vscode.env.appRoot;
            const candidates = [
                path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.css'),
                path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.web.main.css'),
                // Ruta alternativa por si Antigravity cambia la estructura
                path.join(path.dirname(appRoot), 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.css')
            ];
            for (const c of candidates) {
                if (fs.existsSync(c)) return c;
            }
        } catch (_) {}
        return null;
    }

    _removeInjection(css) {
        const start = css.indexOf(INJECTION_MARKER_START);
        const end   = css.indexOf(INJECTION_MARKER_END);
        if (start !== -1 && end !== -1) {
            return css.slice(0, start) + css.slice(end + INJECTION_MARKER_END.length);
        }
        return css;
    }

    _handleFsError(e) {
        if (e.code === 'EACCES' || e.code === 'EPERM') {
            vscode.window.showErrorMessage('[Theme Manager] Sin permisos. Ejecuta Antigravity como Administrador una vez.');
        } else {
            vscode.window.showErrorMessage(`[Theme Manager] Error: ${e.message}`);
        }
    }

    _sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '-');
    }

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
