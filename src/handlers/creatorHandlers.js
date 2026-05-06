// handlers/creatorHandlers.js
// Handlers del dominio: Creador de Temas Personalizados (pestaña Crear).
// Cubre: guardar tema, cargar colores de un tema base, solicitar estado,
// y previsualización en vivo de colores mientras se edita un tema.

const vscode = require('vscode');

/**
 * Fábrica de handlers del creador de temas.
 * @param {object} deps - { creator, sendState, sendCustomThemes }
 */
function createCreatorHandlers({ creator, sendState, sendCustomThemes }) {
    return {

        // Guarda un tema personalizado en disco y actualiza la lista en el webview.
        saveCustomTheme: async (msg, webview) => {
            await creator.saveCustomTheme(msg.name, msg.colors);
            vscode.window.showInformationMessage(
                `[Theme Manager] Tema "${msg.name}" guardado correctamente.`
            );
            sendCustomThemes(webview);
        },

        // Lee el JSON de un tema instalado y lo envía al webview para usarlo como base.
        loadThemeColors: async (msg, webview) => {
            const data = await creator.loadThemeColors(msg.themeLabel);
            webview.postMessage({ command: 'themeColorsLoaded', data, sourceLabel: msg.themeLabel });
        },

        // Responde a la petición explícita del webview de un estado completo (ej. al refrescar).
        requestState: async (_msg, webview) => {
            sendState(webview);
        },

        // Aplica los colores del editor del Creator directamente a workbench.colorCustomizations
        // para dar previsualización en tiempo real sin guardar el tema.
        // Se invoca cada vez que el usuario mueve un color picker en la pestaña Crear.
        previewCreatorColors: async (msg) => {
            const cfg = vscode.workspace.getConfiguration();
            // Tomamos las customizaciones actuales para no borrar las del background manager.
            const existing = cfg.get('workbench.colorCustomizations') || {};
            const preview  = { ...existing, ...(msg.colors || {}) };
            await cfg.update(
                'workbench.colorCustomizations',
                preview,
                vscode.ConfigurationTarget.Global
            );
        },

        // Limpia SOLO los tokens del Creator de workbench.colorCustomizations
        // para restaurar el aspecto del tema original al salir de la pestaña Crear.
        resetCreatorPreview: async (msg) => {
            const cfg  = vscode.workspace.getConfiguration();
            const curr = cfg.get('workbench.colorCustomizations') || {};
            // Eliminamos solo las claves que el Creator conoce (msg.keys).
            const cleaned = { ...curr };
            (msg.keys || []).forEach(k => delete cleaned[k]);
            await cfg.update(
                'workbench.colorCustomizations',
                cleaned,
                vscode.ConfigurationTarget.Global
            );
        }
    };
}

module.exports = { createCreatorHandlers };
