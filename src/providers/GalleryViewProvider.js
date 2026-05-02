// providers/GalleryViewProvider.js
// WebviewViewProvider principal: administra el ciclo de vida del Webview,
// comunica mensajes entre la UI web y la API de Antigravity,
// y coordina ThemeScanner y ThemeCreator.

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');
const ThemeScanner = require('./ThemeScanner');
const ThemeCreator = require('./ThemeCreator');
const SettingsManager = require('./SettingsManager');

class GalleryViewProvider {

    static viewId = 'themeManagerGallery';

    constructor(context) {
        this.context = context;
        this.settings = new SettingsManager(context);
        this.scanner = new ThemeScanner();
        this.creator = new ThemeCreator(context);
        this._view = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CICLO DE VIDA DEL WEBVIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Antigravity llama a este método cuando el panel "Temas" se abre por primera vez.
     */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this.context.extensionUri, 'assets'),
                // Permite acceder a imágenes en cualquier carpeta de Windows
                vscode.Uri.file('C:/')
            ]
        };

        // Carga el HTML inicial
        webviewView.webview.html = this._buildHtml(webviewView.webview);

        // Escucha mensajes que vienen desde el JS del webview
        webviewView.webview.onDidReceiveMessage(
            msg => this._handleMessage(msg, webviewView.webview),
            undefined,
            this.context.subscriptions
        );

        // Cuando el panel se vuelve visible de nuevo, sincronizamos el estado
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) this._sendState(webviewView.webview);
        });

        // Envío inicial de datos
        this._sendState(webviewView.webview);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMUNICACIÓN CON EL WEBVIEW
    // ─────────────────────────────────────────────────────────────────────────

    async _handleMessage(msg, webview) {
        switch (msg.command) {

            // ── Aplicar tema de color
            case 'applyTheme':
                await vscode.workspace.getConfiguration().update(
                    'workbench.colorTheme',
                    msg.themeId,
                    vscode.ConfigurationTarget.Global
                );
                break;

            // ── Aplicar pack de iconos
            case 'applyIconTheme':
                await vscode.workspace.getConfiguration().update(
                    'workbench.iconTheme',
                    msg.iconId,
                    vscode.ConfigurationTarget.Global
                );
                break;

            // ── Aplicar imagen de fondo
            case 'applyBackground': {
                const ok = await this.creator.applyBackground(msg.imagePath, msg.opacity, webview);
                if (ok) {
                    await this.settings.updateSettings({
                        backgroundImagePath: msg.imagePath,
                        backgroundOpacity: msg.opacity
                    });
                }
                webview.postMessage({ command: 'backgroundResult', success: ok });
                break;
            }

            // ── Quitar imagen de fondo
            case 'removeBackground':
                await this.creator.removeBackground(false);
                break;

            // ── Interruptor Maestro (Master Switch)
            case 'masterSwitch': {
                const isActive = msg.value;
                if (!isActive) {
                    // Si se desactiva, limpiamos todo sin preguntar por recarga, pero le avisamos que debe recargar
                    await this.creator.restoreOriginalState();
                    const reload = await vscode.window.showInformationMessage('[Theme Manager] Inyecciones desactivadas. ¿Recargar IDE ahora?', 'Recargar', 'Más tarde');
                    if (reload === 'Recargar') vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else {
                    // Si se activa y había un fondo configurado, intentamos re-aplicarlo
                    const s = this.settings.getSettings();
                    if (s.backgroundImagePath) {
                        const ok = await this.creator.applyBackground(s.backgroundImagePath, s.backgroundOpacity || 0.15, webview);
                        if (ok) {
                            const reload = await vscode.window.showInformationMessage('[Theme Manager] Inyecciones activadas. ¿Recargar IDE ahora?', 'Recargar', 'Más tarde');
                            if (reload === 'Recargar') vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    } else {
                        vscode.window.showInformationMessage('[Theme Manager] Master Switch activado. Configura un fondo para aplicar inyecciones.');
                    }
                }
                break;
            }

            // ── Favoritos (ahora via SettingsManager)
            case 'toggleFavorite': {
                const s = this.settings.getSettings();
                const favorites = s.favoriteThemes || [];
                const updated = favorites.includes(msg.themeId) 
                    ? favorites.filter(id => id !== msg.themeId)
                    : [...favorites, msg.themeId];
                await this.settings.updateSettings({ favoriteThemes: updated });
                this.scanner._colorThemesCache = null; // Limpiar caché para reflejar cambios
                this._sendState(webview);
                break;
            }

            // ── Etiquetas (Uso de InputBox nativo)
            case 'requestAddTag': {
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
                    this.scanner._colorThemesCache = null; // Limpiar caché
                    this._sendState(webview);
                }
                break;
            }

            case 'removeTag': {
                const s = this.settings.getSettings();
                const tags = s.themeTags || {};
                if (tags[msg.themeId]) {
                    tags[msg.themeId] = tags[msg.themeId].filter(t => t !== msg.tag);
                    await this.settings.updateSettings({ themeTags: tags });
                }
                this.scanner._colorThemesCache = null; // Limpiar caché
                this._sendState(webview);
                break;
            }

            case 'deleteTagGlobally': {
                const s = this.settings.getSettings();
                const tags = s.themeTags || {};
                for (const id in tags) {
                    tags[id] = tags[id].filter(t => t !== msg.tag);
                }
                await this.settings.updateSettings({ themeTags: tags });
                this.scanner._colorThemesCache = null; // Limpiar caché
                this._sendState(webview);
                break;
            }

            // ── UI Vitaminada
            case 'updateUISettings': {
                const cfg = vscode.workspace.getConfiguration();
                const updates = msg.settings || {};

                if (updates.editorFontSize !== undefined) await cfg.update('editor.fontSize', updates.editorFontSize, vscode.ConfigurationTarget.Global);
                if (updates.terminalFontSize !== undefined) await cfg.update('terminal.integrated.fontSize', updates.terminalFontSize, vscode.ConfigurationTarget.Global);
                if (updates.zoomLevel !== undefined) await cfg.update('window.zoomLevel', updates.zoomLevel, vscode.ConfigurationTarget.Global);
                if (updates.scrollbarSize !== undefined) {
                    await cfg.update('editor.scrollbar.verticalScrollbarSize', updates.scrollbarSize, vscode.ConfigurationTarget.Global);
                    await cfg.update('editor.scrollbar.horizontalScrollbarSize', updates.scrollbarSize, vscode.ConfigurationTarget.Global);
                }
                if (updates.lineHeight !== undefined) await cfg.update('editor.lineHeight', updates.lineHeight, vscode.ConfigurationTarget.Global);
                if (updates.fontFamily !== undefined) await cfg.update('editor.fontFamily', updates.fontFamily, vscode.ConfigurationTarget.Global);
                
                // Nuevos controles solicitados
                if (updates.minimap !== undefined) await cfg.update('editor.minimap.enabled', updates.minimap, vscode.ConfigurationTarget.Global);
                if (updates.menuBar !== undefined) await cfg.update('window.menuBarVisibility', updates.menuBar ? 'visible' : 'toggle', vscode.ConfigurationTarget.Global);
                if (updates.activityBarPos !== undefined) await cfg.update('workbench.activityBar.location', updates.activityBarPos ? 'default' : 'hidden', vscode.ConfigurationTarget.Global);
                if (updates.statusBar !== undefined) await cfg.update('workbench.statusBar.visible', updates.statusBar, vscode.ConfigurationTarget.Global);
                break;
            }

            // ── Guardar tema personalizado
            case 'saveCustomTheme': {
                const filePath = await this.creator.saveCustomTheme(msg.name, msg.colors);
                vscode.window.showInformationMessage(
                    `[Theme Manager] Tema "${msg.name}" guardado. Para usarlo, instala el pack de temas personalizados.`
                );
                // Notificar al webview que la lista de temas propios cambió
                this._sendCustomThemes(webview);
                break;
            }

            // ── Cargar colores de un tema existente (para "Copiar y editar")
            case 'loadThemeColors': {
                const data = await this.creator.loadThemeColors(msg.themeLabel);
                webview.postMessage({ command: 'themeColorsLoaded', data, sourceLabel: msg.themeLabel });
                break;
            }

            // ── El webview pide el estado completo (ej. tras un refresh)
            case 'requestState':
                this._sendState(webview);
                break;

            // ── Abrir diálogo nativo de selección de archivo (imagen)
            case 'openFilePicker': {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Imágenes': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
                    title: 'Seleccionar imagen de fondo'
                });
                if (uris && uris.length > 0) {
                    const filePath = uris[0].fsPath;
                    const ext = path.extname(filePath).toLowerCase();
                    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

                    if (!allowed.includes(ext)) {
                        vscode.window.showErrorMessage(`[Theme Manager] Formato ${ext} no permitido. Usa PNG, JPG, GIF o WebP.`);
                        return;
                    }

                    const previewUri = webview.asWebviewUri(uris[0]).toString();
                    webview.postMessage({ command: 'fileSelected', filePath, previewUri });
                }
                break;
            }
        }
    }

    /**
     * Envía el estado completo al webview (temas, iconos, configuración actual).
     */
    _sendState(webview) {
        const cfg = vscode.workspace.getConfiguration();
        const s = this.settings.getSettings();
        const bgPath = s.backgroundImagePath || '';

        webview.postMessage({
            command: 'setState',
            colorThemeGroups: this.scanner.getColorThemes(s.favoriteThemes, s.themeTags),
            iconThemes: this.scanner.getIconThemes(),
            allThemesFlat: this.scanner.getAllThemesFlat(),
            customThemes: this.creator.getCustomThemes(),
            currentColorTheme: this.scanner.getCurrentColorTheme(),
            currentIconTheme: this.scanner.getCurrentIconTheme(),
            currentSettings: {
                editorFontSize: cfg.get('editor.fontSize') || 14,
                terminalFontSize: cfg.get('terminal.integrated.fontSize') || 14,
                zoomLevel: cfg.get('window.zoomLevel') || 0,
                scrollbarSize: cfg.get('editor.scrollbar.verticalScrollbarSize') || 10,
                lineHeight: cfg.get('editor.lineHeight') || 0,
                fontFamily: cfg.get('editor.fontFamily') || '',
                minimap: cfg.get('editor.minimap.enabled') !== false,
                menuBar: cfg.get('window.menuBarVisibility') !== 'toggle',
                activityBarPos: cfg.get('workbench.activityBar.location') !== 'hidden',
                statusBar: cfg.get('workbench.statusBar.visible') !== false
            },
            currentBackground: bgPath,
            currentBackgroundUri: bgPath && fs.existsSync(bgPath)
                ? webview.asWebviewUri(vscode.Uri.file(bgPath)).toString()
                : '',
            currentBgOpacity: s.backgroundOpacity || 0.15,
            version: this.context.extension.packageJSON.version || '3.3.2',
            masterSwitchActive: !!(bgPath && fs.existsSync(bgPath)) // Simplificación: si hay fondo, está activo
        });
    }

    _sendCustomThemes(webview) {
        webview.postMessage({
            command: 'updateCustomThemes',
            customThemes: this.creator.getCustomThemes()
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCIONES PÚBLICAS (invocadas desde comandos del IDE)
    // ─────────────────────────────────────────────────────────────────────────

    refresh() {
        if (this._view) this._sendState(this._view.webview);
    }

    async removeBackground() {
        await this.creator.removeBackground();
    }

    syncCurrentTheme() {
        if (this._view?.visible) {
            this._view.webview.postMessage({
                command: 'syncCurrentTheme',
                currentColorTheme: this.scanner.getCurrentColorTheme(),
                currentIconTheme: this.scanner.getCurrentIconTheme()
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCCIÓN DEL HTML
    // ─────────────────────────────────────────────────────────────────────────

    _buildHtml(webview) {
        const cssUri  = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'styles.css')
        );
        const jsUri   = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'main.js')
        );
        const nonce   = this._nonce();

        return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src ${webview.cspSource} 'unsafe-inline';
                   script-src 'nonce-${nonce}';
                   img-src ${webview.cspSource} data: vscode-file: file:;
                   font-src ${webview.cspSource} data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <link rel="stylesheet" href="${cssUri}"/>
    <title>Theme Manager</title>
</head>
<body>
    <div id="app">
        <!-- Pestañas de navegación -->
        <nav id="tabs">
            <button class="tab-btn active" data-tab="colors">🎨 Temas</button>
            <button class="tab-btn" data-tab="icons">🗂 Iconos</button>
            <button class="tab-btn" data-tab="background">🖼 Fondo</button>
            <button class="tab-btn" data-tab="ui">🔧 UI</button>
            <button class="tab-btn" data-tab="creator">✏️ Crear</button>
        </nav>

        <!-- ── PESTAÑA: TEMAS DE COLOR ─────────────────────────────────── -->
        <section id="tab-colors" class="tab-content active">
            <div class="search-bar">
                <input type="text" id="themeSearch" placeholder="🔍 Buscar tema o #etiqueta..."/>
                <div id="versionInfo" class="version-text"></div>
            </div>
            <div id="themeCurrentBadge" class="current-badge"></div>
            <div id="themeListContainer">
                <div id="themeGroups"></div>
            </div>
            <!-- Barra flotante de utilidades -->
            <div class="random-toolbar">
                <button id="btnToggleFolders" class="btn-secondary" title="Ocultar/Mostrar carpetas de temas" style="margin-right:auto;">📂 Ocultar Carpetas</button>
                <div id="btnRandomFav" class="fav-toggle" title="Solo entre favoritos">⭐</div>
                <button id="btnRandomGeneric" class="btn-random">🎲 Aleatorio</button>
            </div>
        </section>

        <!-- ── PESTAÑA: ICONOS ────────────────────────────────────────── -->
        <section id="tab-icons" class="tab-content">
            <div class="search-bar">
                <input type="text" id="iconSearch" placeholder="🔍 Buscar pack de iconos..."/>
            </div>
            <div id="iconCurrentBadge" class="current-badge"></div>
            <div id="iconList"></div>
        </section>

        <!-- ── PESTAÑA: FONDO ─────────────────────────────────────────── -->
        <section id="tab-background" class="tab-content">
            <div class="section-header">
                <h3>Imagen de fondo</h3>
                <p class="hint">Selecciona una imagen desde tu equipo. El cambio requiere recargar el IDE.</p>
            </div>
            <div class="bg-preview-wrap">
                <div id="bgPreview" class="bg-preview">
                    <span id="bgPreviewLabel">Sin imagen</span>
                    <img id="bgPreviewImg" src="" style="display:none"/>
                </div>
            </div>
            
            <div class="master-switch-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="font-weight: bold;">Habilitar Inyecciones (Master Switch)</label>
                    <input type="checkbox" id="masterSwitch" checked/>
                </div>
                <p class="hint" style="margin: 0; font-size: 0.85em; opacity: 0.8;">Apaga este interruptor para remover limpiamente las modificaciones del editor sin desinstalar la extensión.</p>
            </div>

            <div class="control-group">
                <button id="btnPickImage" class="btn-primary">📂 Seleccionar imagen</button>
                <input type="text" id="bgImagePath" placeholder="Ruta de la imagen..." readonly/>
            </div>
            <div class="control-group">
                <label>Opacidad</label>
                <input type="range" id="bgOpacity" min="1" max="99" value="15"/>
                <span id="bgOpacityVal">15%</span>
            </div>
            <div class="btn-row">
                <button id="btnApplyBg" class="btn-primary" disabled>✅ Aplicar fondo</button>
                <button id="btnRemoveBg" class="btn-danger">❌ Quitar fondo</button>
            </div>
            <div class="hint warn">
                ⚠️ Aplicar una imagen de fondo modifica archivos internos del IDE.
                Se ha creado un backup original en tu carpeta de Documentos.
            </div>
        </section>

        <!-- ── PESTAÑA: PERSONALIZAR UI ───────────────────────────────── -->
        <section id="tab-ui" class="tab-content">
            <div class="section-header">
                <h3>Tamaños y componentes</h3>
                <p class="hint">Los cambios se aplican inmediatamente.</p>
            </div>

            <div class="ui-controls">
                <div class="control-row">
                    <label>Fuente del editor (<span id="editorFontSizeVal">14</span>px)</label>
                    <input type="range" id="editorFontSize" min="10" max="28" step="1" value="14"/>
                </div>
                <div class="control-row">
                    <label>Zoom de la interfaz (<span id="zoomLevelVal">0</span>)</label>
                    <input type="range" id="zoomLevel" min="-3" max="5" step="0.5" value="0"/>
                </div>
                <div class="control-row">
                    <label>Barras de desplazamiento (<span id="scrollbarSizeVal">10</span>px)</label>
                    <input type="range" id="scrollbarSize" min="4" max="30" step="1" value="10"/>
                </div>
                
                <hr style="opacity:0.1; margin: 10px 0;"/>

                <div class="control-row" style="flex-direction:row; justify-content:space-between; align-items:center;">
                    <label>Mostrar Minimapa</label>
                    <input type="checkbox" id="uiMinimap" checked/>
                </div>
                <div class="control-row" style="flex-direction:row; justify-content:space-between; align-items:center;">
                    <label>Barra de Menú visible</label>
                    <input type="checkbox" id="uiMenuVisible" checked/>
                </div>
                <div class="control-row" style="flex-direction:row; justify-content:space-between; align-items:center;">
                    <label>Barra lateral a la izquierda</label>
                    <input type="checkbox" id="uiActivityBarPos" checked/>
                </div>
                <div class="control-row" style="flex-direction:row; justify-content:space-between; align-items:center;">
                    <label>Barra inferior (Status Bar)</label>
                    <input type="checkbox" id="uiStatusBar" checked/>
                </div>

                <div class="control-row">
                    <label>Familia de fuente</label>
                    <input type="text" id="fontFamily" placeholder="'Fira Code', monospace"/>
                </div>
            </div>
            <!-- Botón Aplicar eliminado: ¡La UI ahora reacciona en vivo! -->
        </section>

        <!-- ── PESTAÑA: CREAR TEMA ────────────────────────────────────── -->
        <section id="tab-creator" class="tab-content">
            <div class="section-header">
                <h3>Crear tema personalizado</h3>
            </div>

            <div class="creator-tools">
                <div class="control-group">
                    <label>Nombre del tema</label>
                    <input type="text" id="newThemeName" placeholder="Mi Tema Pro"/>
                </div>
                <div class="control-group copy-from-group">
                    <label>Base (Copiar de)</label>
                    <div class="copy-row">
                        <select id="copyFromTheme">
                            <option value="">-- Seleccionar --</option>
                        </select>
                        <button id="btnCopyTheme" class="btn-secondary">📋 Copiar</button>
                    </div>
                </div>
            </div>

            <div class="color-grid">
                <div class="color-row"><span>Fondo Editor</span>
                    <input type="color" data-key="editor.background" value="#1e1e1e"/></div>
                <div class="color-row"><span>Texto Editor</span>
                    <input type="color" data-key="editor.foreground" value="#d4d4d4"/></div>
                <div class="color-row"><span>Sidebar</span>
                    <input type="color" data-key="sideBar.background" value="#252526"/></div>
                <div class="color-row"><span>Botones</span>
                    <input type="color" data-key="button.background" value="#0e639c"/></div>
                <div class="color-row"><span>Barra de Título</span>
                    <input type="color" data-key="titleBar.activeBackground" value="#333333"/></div>
                <div class="color-row"><span>Fondo Terminal</span>
                    <input type="color" data-key="terminal.background" value="#1e1e1e"/></div>
                <div class="color-row"><span>Línea Actual</span>
                    <input type="color" data-key="editor.lineHighlightBackground" value="#ffffff10"/></div>
                <div class="color-row"><span>Hover de Listas</span>
                    <input type="color" data-key="list.hoverBackground" value="#2a2d2e"/></div>
            </div>

            <div class="btn-row">
                <button id="btnSaveTheme" class="btn-primary">💾 Guardar</button>
            </div>

            <div class="section-header" style="margin-top:20px">
                <h3>Mis Temas Guardados</h3>
            </div>
            <div id="savedThemesList" class="saved-themes-list"></div>
        </section>
    </div>

    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }

    _nonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
}

module.exports = GalleryViewProvider;
