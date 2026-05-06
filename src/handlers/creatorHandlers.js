// handlers/creatorHandlers.js
// Handlers del dominio: Creador de Temas Personalizados (pestaña Crear).
// Cubre: guardar tema, cargar colores de un tema base, y solicitar estado.

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
        }
    };
}

module.exports = { createCreatorHandlers };
