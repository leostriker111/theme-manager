// providers/GalleryViewProvider.js
// WebviewViewProvider principal: administra el ciclo de vida del Webview,
// registra los handlers de comandos entrantes desde la UI y coordina
// los módulos especializados: ThemeScanner, ThemeCreator, BackgroundManager y SettingsManager.

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');
const ThemeScanner      = require('./ThemeScanner');
const ThemeCreator      = require('./ThemeCreator');
const BackgroundManager = require('./BackgroundManager');
const SettingsManager   = require('./SettingsManager');

class GalleryViewProvider {

    static viewId = 'themeManagerGallery';

    constructor(context) {
        this.context    = context;
        this.settings   = new SettingsManager(context);
        this.scanner    = new ThemeScanner();
        this.creator    = new ThemeCreator(context);
        this.bgManager  = new BackgroundManager();
        this._view      = null;

        // Registrar todos los handlers de comandos al construir el proveedor.
        // Cada comando del webview tiene su propia función responsable.
        this._handlers = this._buildHandlers();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CICLO DE VIDA DEL WEBVIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * VS Code llama a este método cuando el panel "Temas" se abre por primera vez.
     */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this.context.extensionUri, 'assets'),
                // Permite acceder a imágenes en cualquier carpeta del sistema de archivos
                vscode.Uri.file('C:/')
            ]
        };

        // Cargar el HTML desde el archivo externo src/webview/index.html
        webviewView.webview.html = this._buildHtml(webviewView.webview);

        // Despachar cada mensaje entrante al handler correspondiente
        webviewView.webview.onDidReceiveMessage(
            msg => this._dispatch(msg, webviewView.webview),
            undefined,
            this.context.subscriptions
        );

        // Cuando el panel se vuelve visible de nuevo, sincronizar el estado completo
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) this._sendState(webviewView.webview);
        });

        // Envío inicial de datos al cargar el panel
        this._sendState(webviewView.webview);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SISTEMA DE DESPACHO DE COMANDOS (Handler Pattern)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Punto de entrada único para todos los mensajes del webview.
     * Busca el handler registrado para el comando y lo ejecuta.
     * Si el comando no existe, lo registra en consola para debug.
     */
    async _dispatch(msg, webview) {
        const handler = this._handlers[msg.command];
        if (handler) {
            await handler(msg, webview);
        } else {
            console.warn(`[Theme Manager] Comando desconocido recibido: "${msg.command}"`);
        }
    }

    /**
     * Construye y retorna el mapa de handlers.
     * Cada clave es el nombre del comando que llega desde el webview.
     * Cada valor es una función async (msg, webview) => void.
     *
     * El uso de arrow functions garantiza que `this` siempre apunte
     * a la instancia del GalleryViewProvider sin necesidad de .bind().
     */
    _buildHandlers() {
        return {

            // ── Aplicar tema de color ────────────────────────────────────────
            applyTheme: async (msg) => {
                await vscode.workspace.getConfiguration().update(
                    'workbench.colorTheme',
                    msg.themeId,
                    vscode.ConfigurationTarget.Global
                );
            },

            // ── Aplicar pack de iconos ───────────────────────────────────────
            applyIconTheme: async (msg) => {
                await vscode.workspace.getConfiguration().update(
                    'workbench.iconTheme',
                    msg.iconId,
                    vscode.ConfigurationTarget.Global
                );
            },

            // ── Aplicar imagen de fondo ──────────────────────────────────────
            applyBackground: async (msg, webview) => {
                const ok = await this.bgManager.applyBackground(msg.imagePath, msg.opacity);
                if (ok) {
                    await this.settings.updateSettings({
                        backgroundImagePath: msg.imagePath,
                        backgroundOpacity:  msg.opacity
                    });
                }
                webview.postMessage({ command: 'backgroundResult', success: ok });
            },

            // ── Quitar imagen de fondo ───────────────────────────────────────
            removeBackground: async () => {
                await this.bgManager.removeBackground(false);
                await this.settings.updateSettings({ backgroundImagePath: '' });
            },

            // ── Interruptor Maestro (Master Switch) ──────────────────────────
            masterSwitch: async (msg, webview) => {
                const isActive = msg.value;
                if (!isActive) {
                    await this.bgManager.restoreOriginalState();
                    await this.settings.updateSettings({ masterSwitchActive: false });
                    const choice = await vscode.window.showInformationMessage(
                        '[Theme Manager] Inyecciones desactivadas. ¿Recargar VS Code ahora?',
                        'Recargar', 'Más tarde'
                    );
                    if (choice === 'Recargar') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                } else {
                    const s = this.settings.getSettings();
                    await this.settings.updateSettings({ masterSwitchActive: true });
                    if (s.backgroundImagePath) {
                        const ok = await this.bgManager.applyBackground(
                            s.backgroundImagePath,
                            s.backgroundOpacity || 0.15
                        );
                        if (ok) {
                            const choice = await vscode.window.showInformationMessage(
                                '[Theme Manager] Inyecciones activadas. ¿Recargar VS Code ahora?',
                                'Recargar', 'Más tarde'
                            );
                            if (choice === 'Recargar') {
                                vscode.commands.executeCommand('workbench.action.reloadWindow');
                            }
                        }
                    } else {
                        vscode.window.showInformationMessage(
                            '[Theme Manager] Master Switch activado. Configura un fondo para aplicar inyecciones.'
                        );
                    }
                }
            },

            // ── Favoritos ────────────────────────────────────────────────────
            toggleFavorite: async (msg, webview) => {
                const s = this.settings.getSettings();
                const favorites = s.favoriteThemes || [];
                const updated = favorites.includes(msg.themeId)
                    ? favorites.filter(id => id !== msg.themeId)
                    : [...favorites, msg.themeId];
                await this.settings.updateSettings({ favoriteThemes: updated });
                this.scanner._colorThemesCache = null;
                this._sendState(webview);
            },

            // ── Agregar etiqueta (usa InputBox nativo de VS Code) ────────────
            requestAddTag: async (msg, webview) => {
                const tag = await vscode.window.showInputBox({
                    placeHolder: 'Escribe la nueva etiqueta...',
                    prompt: `Añadir etiqueta al tema "${msg.themeLabel}"`
                });
                if (tag) {
                    const s = this.settings.getSettings();
                    const tags = s.themeTags || {};
                    const current = tags[msg.themeId] || [];
                    if (!current.includes(tag.trim())) {
                        tags[msg.themeId] = [...current, tag.trim()];
                        await this.settings.updateSettings({ themeTags: tags });
                    }
                    this.scanner._colorThemesCache = null;
                    this._sendState(webview);
                }
            },

            // ── Remover etiqueta de un tema ──────────────────────────────────
            removeTag: async (msg, webview) => {
                const s = this.settings.getSettings();
                const tags = s.themeTags || {};
                if (tags[msg.themeId]) {
                    tags[msg.themeId] = tags[msg.themeId].filter(t => t !== msg.tag);
                    await this.settings.updateSettings({ themeTags: tags });
                }
                this.scanner._colorThemesCache = null;
                this._sendState(webview);
            },

            // ── Borrar una etiqueta de todos los temas ───────────────────────
            deleteTagGlobally: async (msg, webview) => {
                const s = this.settings.getSettings();
                const tags = s.themeTags || {};
                for (const id in tags) {
                    tags[id] = tags[id].filter(t => t !== msg.tag);
                }
                await this.settings.updateSettings({ themeTags: tags });
                this.scanner._colorThemesCache = null;
                this._sendState(webview);
            },

            // ── Actualizar configuración visual del IDE ──────────────────────
            updateUISettings: async (msg) => {
                const cfg     = vscode.workspace.getConfiguration();
                const updates = msg.settings || {};
                const G       = vscode.ConfigurationTarget.Global;

                if (updates.editorFontSize  !== undefined) await cfg.update('editor.fontSize',                            updates.editorFontSize,  G);
                if (updates.terminalFontSize !== undefined) await cfg.update('terminal.integrated.fontSize',               updates.terminalFontSize, G);
                if (updates.zoomLevel       !== undefined) await cfg.update('window.zoomLevel',                           updates.zoomLevel,       G);
                if (updates.scrollbarSize   !== undefined) {
                    await cfg.update('editor.scrollbar.verticalScrollbarSize',   updates.scrollbarSize, G);
                    await cfg.update('editor.scrollbar.horizontalScrollbarSize', updates.scrollbarSize, G);
                }
                if (updates.lineHeight      !== undefined) await cfg.update('editor.lineHeight',                          updates.lineHeight,      G);
                if (updates.fontFamily      !== undefined) await cfg.update('editor.fontFamily',                          updates.fontFamily,      G);
                if (updates.minimap         !== undefined) await cfg.update('editor.minimap.enabled',                     updates.minimap,         G);
                if (updates.menuBar         !== undefined) await cfg.update('window.menuBarVisibility',                   updates.menuBar ? 'visible' : 'toggle', G);
                if (updates.activityBarPos  !== undefined) await cfg.update('workbench.activityBar.location',             updates.activityBarPos ? 'default' : 'hidden', G);
                if (updates.statusBar       !== undefined) await cfg.update('workbench.statusBar.visible',                updates.statusBar,       G);
            },

            // ── Guardar tema personalizado ───────────────────────────────────
            saveCustomTheme: async (msg, webview) => {
                await this.creator.saveCustomTheme(msg.name, msg.colors);
                vscode.window.showInformationMessage(
                    `[Theme Manager] Tema "${msg.name}" guardado correctamente.`
                );
                this._sendCustomThemes(webview);
            },

            // ── Cargar colores de un tema existente (para "Copiar y editar") ─
            loadThemeColors: async (msg, webview) => {
                const data = await this.creator.loadThemeColors(msg.themeLabel);
                webview.postMessage({ command: 'themeColorsLoaded', data, sourceLabel: msg.themeLabel });
            },

            // ── El webview pide el estado completo (ej. tras un refresh) ─────
            requestState: async (_msg, webview) => {
                this._sendState(webview);
            },

            // ── Abrir diálogo nativo de selección de archivo (imagen) ────────
            openFilePicker: async (_msg, webview) => {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Imágenes': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
                    title: 'Seleccionar imagen de fondo'
                });
                if (!uris || uris.length === 0) return;

                const filePath = uris[0].fsPath;
                const ext      = path.extname(filePath).toLowerCase();
                const allowed  = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

                if (!allowed.includes(ext)) {
                    vscode.window.showErrorMessage(
                        `[Theme Manager] Formato "${ext}" no permitido. Usa PNG, JPG, GIF o WebP.`
                    );
                    return;
                }

                const previewUri = webview.asWebviewUri(uris[0]).toString();
                webview.postMessage({ command: 'fileSelected', filePath, previewUri });
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMUNICACIÓN CON EL WEBVIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Envía el estado completo al webview: temas, iconos, configuración actual, etc.
     * Se llama al abrir el panel, al recuperar visibilidad y tras cualquier cambio relevante.
     */
    _sendState(webview) {
        const cfg   = vscode.workspace.getConfiguration();
        const s     = this.settings.getSettings();
        const bgPath = s.backgroundImagePath || '';

        webview.postMessage({
            command:           'setState',
            colorThemeGroups:  this.scanner.getColorThemes(s.favoriteThemes, s.themeTags),
            iconThemes:        this.scanner.getIconThemes(),
            allThemesFlat:     this.scanner.getAllThemesFlat(),
            customThemes:      this.creator.getCustomThemes(),
            currentColorTheme: this.scanner.getCurrentColorTheme(),
            currentIconTheme:  this.scanner.getCurrentIconTheme(),
            currentSettings: {
                editorFontSize:   cfg.get('editor.fontSize')                          || 14,
                terminalFontSize: cfg.get('terminal.integrated.fontSize')             || 14,
                zoomLevel:        cfg.get('window.zoomLevel')                         || 0,
                scrollbarSize:    cfg.get('editor.scrollbar.verticalScrollbarSize')   || 10,
                lineHeight:       cfg.get('editor.lineHeight')                        || 0,
                fontFamily:       cfg.get('editor.fontFamily')                        || '',
                minimap:          cfg.get('editor.minimap.enabled')                   !== false,
                menuBar:          cfg.get('window.menuBarVisibility')                 !== 'toggle',
                activityBarPos:   cfg.get('workbench.activityBar.location')           !== 'hidden',
                statusBar:        cfg.get('workbench.statusBar.visible')              !== false
            },
            currentBackground:    bgPath,
            currentBackgroundUri: bgPath && fs.existsSync(bgPath)
                ? webview.asWebviewUri(vscode.Uri.file(bgPath)).toString()
                : '',
            currentBgOpacity:  s.backgroundOpacity    || 0.15,
            version:           this.context.extension.packageJSON.version || '3.3.2',
            // masterSwitchActive ahora viene del estado persistido, no se deduce del archivo
            masterSwitchActive: s.masterSwitchActive !== false
        });
    }

    _sendCustomThemes(webview) {
        webview.postMessage({
            command:      'updateCustomThemes',
            customThemes: this.creator.getCustomThemes()
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCIONES PÚBLICAS (invocadas desde comandos del IDE, no del webview)
    // ─────────────────────────────────────────────────────────────────────────

    refresh() {
        if (this._view) this._sendState(this._view.webview);
    }

    async removeBackground() {
        await this.bgManager.removeBackground();
    }

    syncCurrentTheme() {
        if (this._view?.visible) {
            this._view.webview.postMessage({
                command:          'syncCurrentTheme',
                currentColorTheme: this.scanner.getCurrentColorTheme(),
                currentIconTheme:  this.scanner.getCurrentIconTheme()
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCCIÓN DEL HTML
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lee el archivo src/webview/index.html y reemplaza los marcadores de plantilla
     * con los valores dinámicos de seguridad (nonce, CSP) y rutas de recursos.
     */
    _buildHtml(webview) {
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'styles.css')
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'main.js')
        );
        const nonce = this._nonce();

        // extensionPath es la propiedad correcta en contextos de extensión.
        // extensionUri.fsPath es el fallback por si acaso.
        const htmlPath = path.join(
            this.context.extensionPath || this.context.extensionUri.fsPath,
            'src', 'webview', 'index.html'
        );
        let html = fs.readFileSync(htmlPath, 'utf8');

        html = html
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{nonce\}\}/g,     nonce)
            .replace(/\{\{cssUri\}\}/g,    cssUri)
            .replace(/\{\{jsUri\}\}/g,     jsUri);

        return html;
    }

    _nonce() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return text;
    }
}

module.exports = GalleryViewProvider;
