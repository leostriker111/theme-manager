// handlers/uiHandlers.js
// Handlers del dominio: Personalización Visual del IDE (pestaña UI).
// Controla fuente, zoom, scrollbar, minimap y visibilidad de componentes.

const vscode = require('vscode');

/**
 * Fábrica de handlers de configuración visual del IDE.
 * @param {object} _deps - Dependencias (reservado para extensiones futuras).
 */
function createUiHandlers(_deps) {
    // Alias corto para no repetir vscode.ConfigurationTarget.Global en cada línea.
    const G = vscode.ConfigurationTarget.Global;

    // Mapa estático de clave de mensaje → clave de configuración de VS Code.
    // Si se añade un nuevo control, solo hay que agregar una entrada aquí.
    const SETTINGS_MAP = {
        editorFontSize:   key => [['editor.fontSize', key]],
        terminalFontSize: key => [['terminal.integrated.fontSize', key]],
        zoomLevel:        key => [['window.zoomLevel', key]],
        lineHeight:       key => [['editor.lineHeight', key]],
        fontFamily:       key => [['editor.fontFamily', key]],
        minimap:          key => [['editor.minimap.enabled', key]],
        // El scrollbar actualiza dos claves a la vez con el mismo valor.
        scrollbarSize: key => [
            ['editor.scrollbar.verticalScrollbarSize', key],
            ['editor.scrollbar.horizontalScrollbarSize', key]
        ],
        // menuBar y activityBarPos requieren transformar el boolean a una cadena.
        menuBar:        key => [['window.menuBarVisibility', key ? 'visible' : 'toggle']],
        activityBarPos: key => [['workbench.activityBar.location', key ? 'default' : 'hidden']],
        statusBar:      key => [['workbench.statusBar.visible', key]],
        // Panel lateral secundario (chat, etc.) y terminal integrada
        sidePanel:      key => [['workbench.panel.defaultLocation', key ? 'bottom' : 'bottom'],
                                ['workbench.sideBar.location', 'left']],
        // Breadcrumbs (ruta del archivo sobre el editor)
        breadcrumbs:    key => [['breadcrumbs.enabled', key]],
        // Números de línea del editor
        lineNumbers:    key => [['editor.lineNumbers', key ? 'on' : 'off']],
        // Barra de acciones del editor (botoncitos: split, maximize, etc.)
        editorActions:  key => [['workbench.editor.showTabs', key ? 'multiple' : 'none']]
    };

    return {
        updateUISettings: async (msg) => {
            const cfg     = vscode.workspace.getConfiguration();
            const updates = msg.settings || {};

            for (const [field, resolver] of Object.entries(SETTINGS_MAP)) {
                if (updates[field] === undefined) continue;
                for (const [cfgKey, value] of resolver(updates[field])) {
                    await cfg.update(cfgKey, value, G);
                }
            }
        }
    };
}

module.exports = { createUiHandlers };
