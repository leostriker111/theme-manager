// providers/PanelProvider.js
// Orquestador del panel de Theme Manager.
// Responsabilidad: ciclo de vida del Webview, despacho de mensajes y envío de estado.
// NO contiene lógica de negocio: esa vive en los módulos de handlers y providers.

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

const ThemeScanner      = require('./ThemeScanner');
const ThemeCreator      = require('./ThemeCreator');
const BackgroundManager = require('./BackgroundManager');
const SettingsManager   = require('./SettingsManager');

const { createThemeHandlers }      = require('../handlers/themeHandlers');
const { createIconHandlers }       = require('../handlers/iconHandlers');
const { createBackgroundHandlers } = require('../handlers/backgroundHandlers');
const { createUiHandlers }         = require('../handlers/uiHandlers');
const { createCreatorHandlers }    = require('../handlers/creatorHandlers');

class PanelProvider {

    static viewId = 'themeManagerGallery';

    constructor(context) {
        this.context   = context;
        this.settings  = new SettingsManager(context);
        this.scanner   = new ThemeScanner();
        this.creator   = new ThemeCreator(context);
        this.bgManager = new BackgroundManager();
        this._view     = null;

        // Construir el mapa de handlers fusionando los 5 dominios.
        // Agregar un nuevo dominio = crear su archivo en src/handlers/ y añadirlo aquí.
        this._handlers = this._buildHandlers();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CICLO DE VIDA DEL WEBVIEW
    // ─────────────────────────────────────────────────────────────────────────

    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this.context.extensionUri, 'assets'),
                vscode.Uri.file('C:/')
            ]
        };

        webviewView.webview.html = this._buildHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            msg => this._dispatch(msg, webviewView.webview),
            undefined,
            this.context.subscriptions
        );

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) this._sendState(webviewView.webview);
        });

        this._sendState(webviewView.webview);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DESPACHO DE COMANDOS
    // ─────────────────────────────────────────────────────────────────────────

    async _dispatch(msg, webview) {
        const handler = this._handlers[msg.command];
        if (handler) {
            await handler(msg, webview);
        } else {
            console.warn(`[Theme Manager] Comando desconocido: "${msg.command}"`);
        }
    }

    /**
     * Fusiona los handlers de los 5 dominios en un único mapa.
     * Cada fábrica recibe SOLO las dependencias que necesita (inyección de dependencias).
     * Para añadir un botón nuevo: crear/editar el archivo de handlers correspondiente.
     */
    _buildHandlers() {
        // Pasamos _sendState y _sendCustomThemes como funciones enlazadas para que los
        // handlers de dominio puedan comunicarse con el webview sin acoplarse al Provider.
        const sendState        = this._sendState.bind(this);
        const sendCustomThemes = this._sendCustomThemes.bind(this);

        return Object.assign(
            {},
            createThemeHandlers({
                settings:  this.settings,
                scanner:   this.scanner,
                sendState
            }),
            createIconHandlers({}),
            createBackgroundHandlers({
                settings:  this.settings,
                bgManager: this.bgManager
            }),
            createUiHandlers({}),
            createCreatorHandlers({
                creator:          this.creator,
                sendState,
                sendCustomThemes
            })
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMUNICACIÓN CON EL WEBVIEW
    // ─────────────────────────────────────────────────────────────────────────

    _sendState(webview) {
        const cfg    = vscode.workspace.getConfiguration();
        const s      = this.settings.getSettings();
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
                editorFontSize:   cfg.get('editor.fontSize')                        || 14,
                terminalFontSize: cfg.get('terminal.integrated.fontSize')           || 14,
                zoomLevel:        cfg.get('window.zoomLevel')                       || 0,
                scrollbarSize:    cfg.get('editor.scrollbar.verticalScrollbarSize') || 10,
                lineHeight:       cfg.get('editor.lineHeight')                      || 0,
                fontFamily:       cfg.get('editor.fontFamily')                      || '',
                minimap:          cfg.get('editor.minimap.enabled')                 !== false,
                menuBar:          cfg.get('window.menuBarVisibility')               !== 'toggle',
                activityBarPos:   cfg.get('workbench.activityBar.location')         !== 'hidden',
                statusBar:        cfg.get('workbench.statusBar.visible')            !== false
            },
            currentBackground:    bgPath,
            currentBackgroundUri: bgPath && fs.existsSync(bgPath)
                ? webview.asWebviewUri(vscode.Uri.file(bgPath)).toString()
                : '',
            currentBgOpacity:   s.backgroundOpacity  || 0.15,
            version:            this.context.extension.packageJSON.version || '3.4.0',
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
    // ACCIONES PÚBLICAS (invocadas desde comandos registrados en extension.js)
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
                command:           'syncCurrentTheme',
                currentColorTheme: this.scanner.getCurrentColorTheme(),
                currentIconTheme:  this.scanner.getCurrentIconTheme()
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUCCIÓN DEL HTML
    // ─────────────────────────────────────────────────────────────────────────

    _buildHtml(webview) {
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'styles.css')
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'main.js')
        );
        const nonce = this._nonce();

        const htmlPath = path.join(
            this.context.extensionPath || this.context.extensionUri.fsPath,
            'src', 'webview', 'index.html'
        );
        let html = fs.readFileSync(htmlPath, 'utf8');

        return html
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{nonce\}\}/g,     nonce)
            .replace(/\{\{cssUri\}\}/g,    cssUri)
            .replace(/\{\{jsUri\}\}/g,     jsUri);
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

module.exports = PanelProvider;
