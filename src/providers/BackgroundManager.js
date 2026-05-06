// providers/BackgroundManager.js
// Responsabilidad ÚNICA: gestión de la imagen de fondo del IDE.
// Se encarga de inyectar, remover y restaurar el CSS del workbench de VS Code.
// Separado de ThemeCreator para cumplir con el Principio de Responsabilidad Única (SRP).

const vscode = require('vscode');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

// Marcadores que identifican nuestras inyecciones en el CSS del workbench.
// Son cadenas únicas que no pueden aparecer en el CSS original de VS Code.
const INJECTION_MARKER_START = '/* [THEME-MANAGER-BG-START] */';
const INJECTION_MARKER_END   = '/* [THEME-MANAGER-BG-END] */';

class BackgroundManager {

    constructor() {
        // Ruta donde se guarda el backup del CSS original antes de cualquier modificación.
        // Se almacena en Documentos para que el usuario pueda recuperarlo manualmente si algo falla.
        this.externalBackupPath = path.join(os.homedir(), 'Documents', 'ThemeManager_CSS_Backup_ORIGINAL.css');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OPERACIONES PRINCIPALES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Aplica una imagen de fondo al IDE inyectando CSS en el archivo del workbench.
     * @param {string} imagePath - Ruta absoluta del sistema a la imagen.
     * @param {number} opacity   - Opacidad entre 0 y 1.
     * @returns {boolean} true si se aplicó correctamente, false si hubo un error.
     */
    async applyBackground(imagePath, opacity) {
        const cssFile = this._getWorkbenchCSSPath();
        if (!cssFile) {
            vscode.window.showErrorMessage('[Theme Manager] No se encontró el CSS del workbench de VS Code.');
            return false;
        }

        // Crear backup externo solo si no existe todavía (protección de una sola vez).
        this._createExternalBackup(cssFile);

        // Normalizar la ruta para que el CSS la entienda en Windows (barras invertidas → normales).
        const normalizedPath = imagePath.replace(/\\/g, '/');
        const cssPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
        const finalUrl = `file://${cssPath}`;

        // La imagen va en body::after para estar detrás de todos los elementos del IDE.
        // El body se vuelve transparente para que el pseudo-elemento sea visible.
        const cssToInject = `\n${INJECTION_MARKER_START}
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
            // Limpiar inyección anterior antes de agregar la nueva (evita duplicados).
            content = this._removeInjection(content);
            content += cssToInject;
            fs.writeFileSync(cssFile, content, 'utf-8');

            // Hacer los fondos de los paneles transparentes para que se vea la imagen.
            await this._applyTransparency(true);
            return true;
        } catch (e) {
            this._handleFsError(e);
            return false;
        }
    }

    /**
     * Elimina la inyección de fondo del CSS del workbench y restaura los colores.
     * @param {boolean} silent - Si true, no muestra diálogos ni pide recarga.
     * @returns {boolean} true si se removió correctamente.
     */
    async removeBackground(silent = false) {
        const cssFile = this._getWorkbenchCSSPath();
        if (!cssFile) return false;

        try {
            let content = fs.readFileSync(cssFile, 'utf-8');
            content = this._removeInjection(content);
            fs.writeFileSync(cssFile, content, 'utf-8');

            await this._applyTransparency(false);

            if (!silent) {
                const reload = await vscode.window.showInformationMessage(
                    '[Theme Manager] Fondo eliminado. ¿Recargar VS Code para aplicar cambios?',
                    'Recargar', 'Más tarde'
                );
                if (reload === 'Recargar') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
            return true;
        } catch (e) {
            if (!silent) this._handleFsError(e);
            return false;
        }
    }

    /**
     * Alias semántico para desactivar todas las inyecciones en silencio.
     * Usado por el Master Switch cuando se desactiva.
     */
    async restoreOriginalState() {
        console.log('[Theme Manager] Restaurando estado original (limpieza de inyecciones)...');
        await this.removeBackground(true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSPARENCIA DE COLORES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Activa o desactiva la transparencia de los paneles principales del IDE
     * para que la imagen de fondo sea visible a través de ellos.
     * @param {boolean} active - true para hacer transparentes, false para restaurar.
     */
    async _applyTransparency(active) {
        const cfg = vscode.workspace.getConfiguration();
        if (!active) {
            // Restaurar: limpiar el objeto de customizaciones completamente.
            await cfg.update('workbench.colorCustomizations', {}, vscode.ConfigurationTarget.Global);
            return;
        }

        // Ponemos el fondo de los paneles en transparente (#00000000 = negro con alpha 0).
        // Esto permite que la imagen de body::after sea visible sin alterar
        // los colores de fuente, bordes e iconos del tema activo.
        const customizations = {
            'editor.background':                  '#00000000',
            'sideBar.background':                 '#00000000',
            'terminal.background':                '#00000000',
            'breadcrumb.background':              '#00000000',
            'editorGroupHeader.tabsBackground':   '#00000000',
            'tab.activeBackground':               '#00000000',
            'tab.inactiveBackground':             '#00000000'
        };

        await cfg.update('workbench.colorCustomizations', customizations, vscode.ConfigurationTarget.Global);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILIDADES PRIVADAS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Encuentra la ruta del CSS principal del workbench de VS Code.
     * Prueba rutas candidatas conocidas porque VS Code no expone esta ruta por API.
     */
    _getWorkbenchCSSPath() {
        try {
            const appRoot = vscode.env.appRoot;
            const candidates = [
                path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.css'),
                path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.web.main.css'),
                path.join(path.dirname(appRoot), 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.css')
            ];
            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) return candidate;
            }
        } catch (_) { /* No hacer nada si VS Code no expone appRoot */ }
        return null;
    }

    /**
     * Elimina el bloque de CSS inyectado, incluyendo el salto de línea previo
     * para no ir acumulando líneas vacías con cada aplicación.
     */
    _removeInjection(css) {
        const start = css.indexOf(INJECTION_MARKER_START);
        const end   = css.indexOf(INJECTION_MARKER_END);
        if (start === -1 || end === -1) return css;

        // Incluir el '\n' que pusimos antes del marcador para no dejar líneas vacías
        const cutStart = css[start - 1] === '\n' ? start - 1 : start;
        return css.slice(0, cutStart) + css.slice(end + INJECTION_MARKER_END.length);
    }

    _createExternalBackup(source) {
        if (!fs.existsSync(this.externalBackupPath)) {
            try {
                fs.copyFileSync(source, this.externalBackupPath);
                console.log('[Theme Manager] Backup del CSS original creado en:', this.externalBackupPath);
            } catch (e) {
                console.error('[Theme Manager] No se pudo crear el backup externo:', e.message);
            }
        }
    }

    _handleFsError(e) {
        if (e.code === 'EACCES' || e.code === 'EPERM') {
            vscode.window.showErrorMessage(
                '[Theme Manager] Sin permisos para modificar el CSS. Ejecuta VS Code como Administrador una vez.'
            );
        } else {
            vscode.window.showErrorMessage(`[Theme Manager] Error al modificar el CSS: ${e.message}`);
        }
    }
}

module.exports = BackgroundManager;
