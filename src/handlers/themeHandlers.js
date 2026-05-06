// handlers/themeHandlers.js
// Handlers del dominio: Temas de Color (pestaña Temas).
// Cubre: aplicar tema, favoritos y etiquetas.

const vscode = require('vscode');

/**
 * Fábrica de handlers de temas de color.
 * Recibe las dependencias necesarias y devuelve un objeto con los handlers.
 * @param {object} deps - { settings, scanner, sendState }
 */
function createThemeHandlers({ settings, scanner, sendState }) {
    return {

        // Aplica un tema de color al IDE globalmente.
        applyTheme: async (msg) => {
            await vscode.workspace.getConfiguration().update(
                'workbench.colorTheme',
                msg.themeId,
                vscode.ConfigurationTarget.Global
            );
        },

        // Alterna el estado favorito de un tema y reenvía el estado completo.
        toggleFavorite: async (msg, webview) => {
            const s         = settings.getSettings();
            const favorites = s.favoriteThemes || [];
            const updated   = favorites.includes(msg.themeId)
                ? favorites.filter(id => id !== msg.themeId)
                : [...favorites, msg.themeId];
            await settings.updateSettings({ favoriteThemes: updated });
            scanner.invalidateCache();
            sendState(webview);
        },

        // Abre un InputBox nativo de VS Code para añadir una etiqueta a un tema.
        requestAddTag: async (msg, webview) => {
            const tag = await vscode.window.showInputBox({
                placeHolder: 'Escribe la nueva etiqueta...',
                prompt: `Añadir etiqueta al tema "${msg.themeLabel}"`
            });
            if (!tag) return;

            const s       = settings.getSettings();
            const tags    = s.themeTags || {};
            const current = tags[msg.themeId] || [];
            if (!current.includes(tag.trim())) {
                tags[msg.themeId] = [...current, tag.trim()];
                await settings.updateSettings({ themeTags: tags });
            }
            scanner.invalidateCache();
            sendState(webview);
        },

        // Elimina una etiqueta específica de un tema.
        removeTag: async (msg, webview) => {
            const s    = settings.getSettings();
            const tags = s.themeTags || {};
            if (tags[msg.themeId]) {
                tags[msg.themeId] = tags[msg.themeId].filter(t => t !== msg.tag);
                await settings.updateSettings({ themeTags: tags });
            }
            scanner.invalidateCache();
            sendState(webview);
        },

        // Elimina una etiqueta de TODOS los temas que la tengan.
        deleteTagGlobally: async (msg, webview) => {
            const s    = settings.getSettings();
            const tags = s.themeTags || {};
            for (const id in tags) {
                tags[id] = tags[id].filter(t => t !== msg.tag);
            }
            await settings.updateSettings({ themeTags: tags });
            scanner.invalidateCache();
            sendState(webview);
        }
    };
}

module.exports = { createThemeHandlers };
