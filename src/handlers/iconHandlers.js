// handlers/iconHandlers.js
// Handlers del dominio: Packs de Iconos (pestaña Iconos).

const vscode = require('vscode');

/**
 * Fábrica de handlers de iconos.
 * @param {object} _deps - Dependencias (reservado para extensiones futuras).
 */
function createIconHandlers(_deps) {
    return {

        // Aplica un pack de iconos al IDE globalmente.
        applyIconTheme: async (msg) => {
            await vscode.workspace.getConfiguration().update(
                'workbench.iconTheme',
                msg.iconId,
                vscode.ConfigurationTarget.Global
            );
        }
    };
}

module.exports = { createIconHandlers };
